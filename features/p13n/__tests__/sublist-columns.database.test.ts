import type { TenantUser } from "@/features/user/user.schema";

import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { createTranslator } from "next-intl";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUserWithPermissions } from "@/tests/helpers/mock-user";
import messages from "@/i18n/locales/en.json";

vi.mock("next-intl/server", () => ({
  getLocale: () => Promise.resolve("en"),
  getTranslations: (namespace?: string) =>
    Promise.resolve(createTranslator({ locale: "en", messages, namespace: namespace as never })),
}));
vi.mock("@/env", () => ({
  env: {
    APP_MODE: "cloud",
    DATABASE_URL: process.env.DATABASE_URL,
    BASE_URL: "http://localhost:4000",
    NODE_ENV: "test",
  },
}));

const { runWithTenant } = await import("@/core/decorators/tenant-context");
const { PrismaP13nRepo } = await import("../prisma-p13n.repository");
const { UpsertP13nInteractor } = await import("../upsert-p13n.interactor");
const { GetP13nInteractor } = await import("../get-p13n.interactor");
const { sublistColumnsP13nId } = await import("../sublist-columns.schema");

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase("personal sub-list columns in P13n settings", () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const companyId = randomUUID();
  const firstUserId = randomUUID();
  const secondUserId = randomUUID();
  const lineItems = sublistColumnsP13nId(randomUUID());
  const tasks = sublistColumnsP13nId(randomUUID());
  const tenant = (id: string): TenantUser => ({ ...createMockUserWithPermissions([]), id, companyId });
  const repo = new PrismaP13nRepo();
  const upsert = (userId: string, data: unknown) =>
    runWithTenant(tenant(userId), () => new UpsertP13nInteractor(repo).invoke(data as never));
  const read = (userId: string, p13nId: string) =>
    runWithTenant(tenant(userId), async () => (await new GetP13nInteractor(repo).invoke({ p13nId })).data);
  const quantity = randomUUID();
  const amount = randomUUID();
  const choice = { columns: [amount, quantity, "system:createdAt", `relationship:${randomUUID()}:outgoing`] };

  beforeAll(async () => {
    await client.connect();
    await client.query('INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, CURRENT_TIMESTAMP)', [companyId]);
    await client.query(
      'INSERT INTO "User" ("id", "email", "firstName", "lastName", "companyId", "updatedAt") VALUES ($1, $2, $3, $4, $7, CURRENT_TIMESTAMP), ($5, $6, $3, $4, $7, CURRENT_TIMESTAMP)',
      [
        firstUserId,
        `first-${firstUserId}@example.invalid`,
        "Columns",
        "Tester",
        secondUserId,
        `second-${secondUserId}@example.invalid`,
        companyId,
      ],
    );
  });

  afterAll(async () => {
    await client.query('DELETE FROM "P13n" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "User" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "Company" WHERE "id" = $1', [companyId]);
    await client.end();
  });

  it("stores one ordered choice per person and sub-list without configure rights", async () => {
    expect(await read(firstUserId, lineItems)).toBeUndefined();
    expect((await upsert(firstUserId, { p13nId: lineItems, settings: choice })).ok).toBe(true);
    expect((await read(firstUserId, lineItems))?.settings).toEqual(choice);
    expect(await read(firstUserId, tasks)).toBeUndefined();
    expect(await read(secondUserId, lineItems)).toBeUndefined();
  });

  it("resets to the default by clearing the settings", async () => {
    expect((await upsert(firstUserId, { p13nId: lineItems, settings: null })).ok).toBe(true);
    expect((await read(firstUserId, lineItems))?.settings).toBeUndefined();
  });

  it("refuses malformed choices and ids that do not name a sub-list", async () => {
    const invalid = [
      { p13nId: lineItems, settings: { columns: [quantity, quantity] } },
      { p13nId: lineItems, settings: { columns: ["not a column"] } },
      { p13nId: lineItems, settings: { columns: [quantity], extra: true } },
      { p13nId: lineItems, settings: { entries: [], hidden: [] } },
      { p13nId: "sublist-columns:line-items", settings: { columns: [quantity] } },
      { p13nId: "sidebar", settings: { columns: [quantity] } },
    ];
    for (const data of invalid) await expect(upsert(secondUserId, data)).resolves.toMatchObject({ ok: false });
    expect(await read(secondUserId, lineItems)).toBeUndefined();
  });
});
