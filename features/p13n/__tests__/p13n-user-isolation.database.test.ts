import type { TenantUser } from "@/features/user/user.schema";

import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runWithTenant } from "@/core/decorators/tenant-context";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUser } from "@/tests/helpers/mock-user";

import { PrismaP13nRepo } from "../prisma-p13n.repository";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase("P13n user isolation on PostgreSQL", () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const companyId = randomUUID();
  const firstUserId = randomUUID();
  const secondUserId = randomUUID();
  const p13nId = "contact-detail";

  const tenant = (id: string): TenantUser => createMockUser({ id, companyId });

  beforeAll(async () => {
    await client.connect();
    await client.query('INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, CURRENT_TIMESTAMP)', [companyId]);
    await client.query(
      'INSERT INTO "User" ("id", "email", "firstName", "lastName", "companyId", "updatedAt") VALUES ($1, $2, $3, $4, $7, CURRENT_TIMESTAMP), ($5, $6, $3, $4, $7, CURRENT_TIMESTAMP)',
      [
        firstUserId,
        `first-${firstUserId}@example.invalid`,
        "P13n",
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

  it("keeps independent detail options for two users sharing one company and P13n id", async () => {
    await runWithTenant(tenant(firstUserId), () =>
      new PrismaP13nRepo().upsertP13n({
        p13nId,
        columnOrder: ["first-custom-field"],
        detailOptions: {
          starredFieldIds: ["identifiers", "first-custom-field"],
          collapsedSectionIds: ["relations"],
          hiddenFieldIds: ["lastName"],
        },
      }),
    );
    await runWithTenant(tenant(secondUserId), () =>
      new PrismaP13nRepo().upsertP13n({
        p13nId,
        columnOrder: ["second-custom-field"],
        detailOptions: {
          starredFieldIds: ["userIds", "second-custom-field"],
          collapsedSectionIds: ["customFields"],
          hiddenFieldIds: ["createdAt"],
        },
      }),
    );

    const first = await runWithTenant(tenant(firstUserId), () => new PrismaP13nRepo().getP13n(p13nId));
    const second = await runWithTenant(tenant(secondUserId), () => new PrismaP13nRepo().getP13n(p13nId));

    expect(first).toMatchObject({
      columnOrder: ["first-custom-field"],
      detailOptions: {
        starredFieldIds: ["identifiers", "first-custom-field"],
        collapsedSectionIds: ["relations"],
        hiddenFieldIds: ["lastName"],
      },
    });
    expect(second).toMatchObject({
      columnOrder: ["second-custom-field"],
      detailOptions: {
        starredFieldIds: ["userIds", "second-custom-field"],
        collapsedSectionIds: ["customFields"],
        hiddenFieldIds: ["createdAt"],
      },
    });

    const rows = await client.query(
      'SELECT "userId" FROM "P13n" WHERE "companyId" = $1 AND "p13nId" = $2 ORDER BY "userId"',
      [companyId, p13nId],
    );
    expect(rows.rows.map((row) => row.userId)).toEqual([firstUserId, secondUserId].sort());
  });
});
