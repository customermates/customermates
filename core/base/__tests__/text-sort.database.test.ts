import type { TenantUser } from "@/features/user/user.schema";

import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { Action, Locale, Resource } from "@/generated/prisma";

import { PrismaCalendarRepo } from "@/ee/calendar/prisma-calendar.repository";
import { PrismaRoutineRepo } from "@/ee/routines/prisma-routine.repository";
import { PrismaRoleRepo } from "@/features/role/prisma-role.repository";
import { PrismaServiceRepo } from "@/features/services/prisma-service.repository";
import { PrismaUserRepo } from "@/features/user/prisma-user.repository";
import { PrismaWebhookRepo } from "@/features/webhook/prisma-webhook.repository";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUserWithPermissions } from "@/tests/helpers/mock-user";
import { runWithTenant } from "@/core/decorators/tenant-context";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

const STORED = ["CRM Setup", "Change Management", "CI Pipeline", "Überprüfung", "Umzug", "Zahlung"];
const GERMAN_ORDER = ["Change Management", "CI Pipeline", "CRM Setup", "Überprüfung", "Umzug", "Zahlung"];

describeDatabase("built-in text sorts on PostgreSQL follow the user's locale", () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const companyId = randomUUID();
  const viewerId = randomUUID();
  const accountId = randomUUID();
  const reader: TenantUser = {
    ...createMockUserWithPermissions(
      [Resource.services, Resource.routines, Resource.users, Resource.api].map((resource) => ({
        resource,
        action: Action.readAll,
      })),
    ),
    id: viewerId,
    companyId,
    displayLanguage: Locale.de,
    formattingLocale: Locale.de,
  };
  const scheduled = new Map([
    ["Umzug", new Date("2026-10-01T08:00:00.000Z")],
    ["Zahlung", new Date("2026-10-02T08:00:00.000Z")],
  ]);

  beforeAll(async () => {
    await client.connect();
    await client.query('INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, CURRENT_TIMESTAMP)', [companyId]);

    for (const [index, name] of STORED.entries()) {
      await client.query(
        'INSERT INTO "User" ("id", "email", "firstName", "lastName", "companyId", "updatedAt") VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)',
        [index === 0 ? viewerId : randomUUID(), `${randomUUID()}@example.com`, name, "Person", companyId],
      );
      await client.query(
        'INSERT INTO "Service" ("id", "name", "amount", "companyId", "updatedAt") VALUES ($1, $2, 1, $3, CURRENT_TIMESTAMP)',
        [randomUUID(), name, companyId],
      );
      await client.query(
        `INSERT INTO "Routine" ("id", "companyId", "name", "prompt", "triggerKind", "enabled", "nextRunAt", "updatedAt")
         VALUES ($1, $2, $3, 'Summarise the pipeline.', 'schedule'::"RoutineTriggerKind", false, $4, CURRENT_TIMESTAMP)`,
        [randomUUID(), companyId, name, scheduled.get(name) ?? null],
      );
      await client.query(
        `INSERT INTO "Webhook" ("id", "url", "events", "companyId", "updatedAt") VALUES ($1, $2, '{}', $3, CURRENT_TIMESTAMP)`,
        [randomUUID(), `https://example.com/${name}`, companyId],
      );
      await client.query(
        'INSERT INTO "UserRole" ("id", "name", "isSystemRole", "companyId", "updatedAt") VALUES ($1, $2, false, $3, CURRENT_TIMESTAMP)',
        [randomUUID(), name, companyId],
      );
      if (index === 0) {
        await client.query(
          `INSERT INTO "ConnectedAccount" ("id", "companyId", "userId", "unipileAccountId", "provider", "updatedAt")
           VALUES ($1, $2, $3, $4, 'google'::"MessagingProvider", CURRENT_TIMESTAMP)`,
          [accountId, companyId, viewerId, randomUUID()],
        );
      }
      await client.query(
        `INSERT INTO "Calendar" ("id", "companyId", "connectedAccountId", "unipileCalendarId", "name", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
        [randomUUID(), companyId, accountId, randomUUID(), name],
      );
    }
  });

  afterAll(async () => {
    for (const table of ["Calendar", "ConnectedAccount", "Routine", "Webhook", "Service", "User", "UserRole"])
      await client.query(`DELETE FROM "${table}" WHERE "companyId" = $1`, [companyId]);
    await client.query('DELETE FROM "Company" WHERE "id" = $1', [companyId]);
    await client.end();
  });

  const read = <T>(fn: () => Promise<T>) => runWithTenant(reader, fn);

  it.each(["asc", "desc"] as const)("sorts services, routines, members, webhooks and roles %s", async (direction) => {
    const expected = direction === "asc" ? GERMAN_ORDER : [...GERMAN_ORDER].reverse();
    const params = { sortDescriptor: { field: "name", direction } };

    const services = await read(() => new PrismaServiceRepo().getItems(params));
    const routines = await read(() => new PrismaRoutineRepo().getItems(params));
    const members = await read(() => new PrismaUserRepo().getItems(params));
    const webhooks = await read(() => new PrismaWebhookRepo().getItems(params));
    const roles = await read(() =>
      new PrismaRoleRepo().getItems({ sortDescriptor: { field: "type", direction: "asc" } }),
    );

    expect(services.map((service) => service.name)).toEqual(expected);
    expect(routines.map((routine) => routine.name)).toEqual(expected);
    expect(members.map((member) => member.firstName)).toEqual(expected);
    expect(webhooks.map((webhook) => webhook.url)).toEqual(expected.map((name) => `https://example.com/${name}`));
    expect(roles.map((role) => role.name)).toEqual(GERMAN_ORDER);
  });

  it("lists calendars in the locale order by default and when sorted by name", async () => {
    const byDefault = await read(() => new PrismaCalendarRepo().getItems({}));
    const descending = await read(() =>
      new PrismaCalendarRepo().getItems({ sortDescriptor: { field: "name", direction: "desc" } }),
    );

    expect(byDefault.map((calendar) => calendar.name)).toEqual(GERMAN_ORDER);
    expect(descending.map((calendar) => calendar.name)).toEqual([...GERMAN_ORDER].reverse());
  });

  it("pages after sorting, so the second page starts where the locale order continues", async () => {
    const page = await read(() =>
      new PrismaServiceRepo().getItems({ sortDescriptor: { field: "name", direction: "asc" }, skip: 2, take: 2 }),
    );

    expect(page.map((service) => service.name)).toEqual(["CRM Setup", "Überprüfung"]);
  });

  it.each(["asc", "desc"] as const)("lists routines without a next run last when sorting %s", async (direction) => {
    const routines = await read(() =>
      new PrismaRoutineRepo().getItems({ sortDescriptor: { field: "nextRunAt", direction } }),
    );
    const scheduledNames = direction === "asc" ? ["Umzug", "Zahlung"] : ["Zahlung", "Umzug"];

    expect(routines.slice(0, 2).map((routine) => routine.name)).toEqual(scheduledNames);
    expect(routines.slice(2).every((routine) => routine.nextRunAt === null)).toBe(true);
  });
});
