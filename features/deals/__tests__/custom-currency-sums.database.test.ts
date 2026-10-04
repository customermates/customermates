import type { TenantUser } from "@/features/user/user.schema";

import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { Action, CustomColumnType, EntityType, Resource } from "@/generated/prisma";

import { FilterOperatorKey } from "@/core/base/base-query-builder";
import { PrismaDealRepo } from "../prisma-deal.repository";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUserWithPermissions } from "@/tests/helpers/mock-user";
import { runWithTenant } from "@/core/decorators/tenant-context";
import { PrismaCompanyRepo } from "@/features/company/prisma-company.repository";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase("summing a custom currency column on PostgreSQL", () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const companyId = randomUUID();
  const viewerId = randomUUID();
  const committedColumnId = randomUUID();
  const labelColumnId = randomUUID();

  const deals = {
    committedThousand: randomUUID(),
    committedZero: randomUUID(),
    committedMissing: randomUUID(),
    excludedByFilter: randomUUID(),
  };

  const viewer = {
    ...createMockUserWithPermissions([{ resource: Resource.deals, action: Action.readAll }]),
    id: viewerId,
    companyId,
  } as TenantUser;

  beforeAll(async () => {
    await client.connect();
    await client.query('INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, CURRENT_TIMESTAMP)', [companyId]);
    await client.query(
      'INSERT INTO "User" ("id", "email", "firstName", "lastName", "companyId", "updatedAt") VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)',
      [viewerId, `${viewerId}@example.com`, "Viewer", "Person", companyId],
    );

    for (const [id, label, type] of [
      [committedColumnId, "Committed amount", CustomColumnType.currency],
      [labelColumnId, "Account note", CustomColumnType.plain],
    ] as const) {
      await client.query(
        'INSERT INTO "CustomColumn" ("id", "label", "type", "entityType", "companyId", "updatedAt") VALUES ($1, $2, $3::"CustomColumnType", $4::"EntityType", $5, CURRENT_TIMESTAMP)',
        [id, label, type, EntityType.deal, companyId],
      );
    }

    for (const [name, id] of Object.entries(deals)) {
      await client.query(
        'INSERT INTO "Deal" ("id", "name", "totalValue", "totalQuantity", "companyId", "updatedAt") VALUES ($1, $2, 100, 1, $3, CURRENT_TIMESTAMP)',
        [id, `Nordwind ${name}`, companyId],
      );
    }
    await client.query('UPDATE "Deal" SET "name" = $1 WHERE "id" = $2', ["Other excluded", deals.excludedByFilter]);

    const committed: Array<[string, string | null]> = [
      [deals.committedThousand, "1000"],
      [deals.committedZero, "0"],
      [deals.excludedByFilter, "999"],
    ];
    for (const [dealId, numeric] of committed) {
      await client.query(
        'INSERT INTO "CustomFieldValue" ("id", "entityType", "columnId", "value", "numericValue", "type", "companyId", "dealId", "updatedAt") VALUES ($1, $2::"EntityType", $3, $4, $5, $6::"CustomColumnType", $7, $8, CURRENT_TIMESTAMP)',
        [
          randomUUID(),
          EntityType.deal,
          committedColumnId,
          numeric,
          numeric,
          CustomColumnType.currency,
          companyId,
          dealId,
        ],
      );
    }
  });

  afterAll(async () => {
    await client.query('DELETE FROM "CustomFieldValue" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "Deal" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "CustomColumn" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "User" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "Company" WHERE "id" = $1', [companyId]);
    await client.end();
  });

  it("sums the currency column across every filtered deal and ignores the ones with no value", async () => {
    const sums = await runWithTenant(viewer, () =>
      new PrismaDealRepo(new PrismaCompanyRepo()).sumCustomColumnValues({
        entityType: EntityType.deal,
        columnIds: [committedColumnId, labelColumnId],
        params: {
          filters: [{ field: "name", operator: FilterOperatorKey.contains, value: "Nordwind" }],
        },
      }),
    );

    expect(sums[committedColumnId]).toBe(1000);
    expect(sums[labelColumnId]).toBeUndefined();
  });

  it("returns nothing when no column is asked for", async () => {
    const sums = await runWithTenant(viewer, () =>
      new PrismaDealRepo(new PrismaCompanyRepo()).sumCustomColumnValues({
        entityType: EntityType.deal,
        columnIds: [],
        params: {},
      }),
    );
    expect(sums).toEqual({});
  });
});
