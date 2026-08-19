import type { TenantUser } from "@/features/user/user.schema";

import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { Action, CustomColumnType, EntityType, Resource } from "@/generated/prisma";

import { FilterSchema } from "@/core/base/base-get.schema";
import { FilterOperatorKey } from "@/core/base/base-query-builder";
import { runWithTenant } from "@/core/decorators/tenant-context";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUserWithPermissions } from "@/tests/helpers/mock-user";
import { PrismaContactRepo } from "../prisma-contact.repository";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase("currency filter queries on PostgreSQL", () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const companyId = randomUUID();
  const columnId = randomUUID();

  const amounts = { minusFifty: -50, zero: 0, two: 2, ten: 10 };
  const contactIds = {
    minusFifty: randomUUID(),
    zero: randomUUID(),
    two: randomUUID(),
    ten: randomUUID(),
    unset: randomUUID(),
  };

  const viewer: TenantUser = {
    ...createMockUserWithPermissions([{ resource: Resource.contacts, action: Action.readAll }]),
    id: randomUUID(),
    companyId,
  };

  async function idsMatching(operator: FilterOperatorKey, value?: number | string) {
    const filter = FilterSchema.parse(
      value === undefined ? { field: columnId, operator } : { field: columnId, operator, value },
    );

    const items = await runWithTenant(viewer, () => new PrismaContactRepo().getItems({ filters: [filter] }));

    return new Set(items.map((item) => item.id));
  }

  beforeAll(async () => {
    await client.connect();
    await client.query('INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, CURRENT_TIMESTAMP)', [companyId]);
    await client.query(
      'INSERT INTO "CustomColumn" ("id", "label", "type", "entityType", "companyId", "updatedAt") VALUES ($1, $2, $3::"CustomColumnType", $4::"EntityType", $5, CURRENT_TIMESTAMP)',
      [columnId, "Contract value", CustomColumnType.currency, EntityType.contact, companyId],
    );

    for (const [key, id] of Object.entries(contactIds)) {
      await client.query(
        'INSERT INTO "Contact" ("id", "firstName", "lastName", "companyId", "updatedAt") VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)',
        [id, "Synthetic", key, companyId],
      );

      const amount = amounts[key as keyof typeof amounts];
      if (amount === undefined) continue;

      await client.query(
        'INSERT INTO "CustomFieldValue" ("id", "entityType", "columnId", "value", "numericValue", "type", "companyId", "contactId", "updatedAt") VALUES ($1, $2::"EntityType", $3, $4, $5, $6::"CustomColumnType", $7, $8, CURRENT_TIMESTAMP)',
        [randomUUID(), EntityType.contact, columnId, String(amount), amount, CustomColumnType.currency, companyId, id],
      );
    }
  });

  afterAll(async () => {
    await client.query('DELETE FROM "CustomFieldValue" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "Contact" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "CustomColumn" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "Company" WHERE "id" = $1', [companyId]);
    await client.end();
  });

  it("compares numerically rather than lexicographically for gt", async () => {
    const matched = await idsMatching(FilterOperatorKey.gt, 2);

    expect(matched).toEqual(new Set([contactIds.ten]));
  });

  it("compares numerically rather than lexicographically for lt", async () => {
    const matched = await idsMatching(FilterOperatorKey.lt, 10);

    expect(matched).toEqual(new Set([contactIds.minusFifty, contactIds.zero, contactIds.two]));
  });

  it("includes the boundary for gte and lte", async () => {
    expect(await idsMatching(FilterOperatorKey.gte, 2)).toEqual(new Set([contactIds.two, contactIds.ten]));
    expect(await idsMatching(FilterOperatorKey.lte, 0)).toEqual(new Set([contactIds.minusFifty, contactIds.zero]));
  });

  it.each([
    ["minusFifty", amounts.minusFifty],
    ["zero", amounts.zero],
    ["two", amounts.two],
    ["ten", amounts.ten],
  ])("matches %s exactly with equals", async (key, amount) => {
    const matched = await idsMatching(FilterOperatorKey.equals, amount);

    expect(matched).toEqual(new Set([contactIds[key as keyof typeof contactIds]]));
  });

  it("returns the same records for the number and canonical string transport forms", async () => {
    expect(await idsMatching(FilterOperatorKey.gt, 2)).toEqual(await idsMatching(FilterOperatorKey.gt, "2"));
    expect(await idsMatching(FilterOperatorKey.equals, -50)).toEqual(
      await idsMatching(FilterOperatorKey.equals, "-50"),
    );
  });

  it("separates records with and without a value", async () => {
    expect(await idsMatching(FilterOperatorKey.isNull)).toEqual(new Set([contactIds.unset]));
    expect(await idsMatching(FilterOperatorKey.isNotNull)).toEqual(
      new Set([contactIds.minusFifty, contactIds.zero, contactIds.two, contactIds.ten]),
    );
  });

  it("keeps the count consistent with the returned items", async () => {
    const filter = FilterSchema.parse({ field: columnId, operator: FilterOperatorKey.gte, value: 0 });

    const [items, total] = await runWithTenant(viewer, async () => {
      const repo = new PrismaContactRepo();

      return Promise.all([repo.getItems({ filters: [filter] }), repo.getCount({ filters: [filter] })]);
    });

    expect(items).toHaveLength(3);
    expect(total).toBe(3);
  });
});
