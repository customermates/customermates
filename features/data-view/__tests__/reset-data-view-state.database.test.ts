import type { TenantUser } from "@/features/user/user.schema";

import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { MOCK_ZOD_MODULE } from "@/tests/helpers/interactor-test-setup";

vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("next-intl/server", () => ({ getTranslations: () => Promise.resolve({ raw: (key: string) => key }) }));

import { runWithTenant } from "@/core/decorators/tenant-context";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUser } from "@/tests/helpers/mock-user";
import { ALL_VIEW_KEY } from "@/core/data-view/data-view-keys";
import { createTestDataViewRepo } from "@/tests/helpers/record-repository";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

const STATE_COLUMNS = `"filters" IS NULL AS "filtersNull", "searchTerm", "sortDescriptor" IS NULL AS "sortNull",
  "viewMode", "grouping" IS NULL AS "groupingNull", "groupingColumnId", "columnOrder"::text AS "columnOrder",
  "columnWidths" IS NULL AS "widthsNull", "hiddenColumns"::text AS "hiddenColumns", "updatedAt"`;

describeDatabase("data view state reset on PostgreSQL", () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const companyId = randomUUID();
  const userId = randomUUID();
  const otherUserId = randomUUID();
  const surfaceKey = `records:${randomUUID()}` as const;
  const tenant: TenantUser = createMockUser({ id: userId, companyId });
  const asTenant = <T>(fn: () => Promise<T>) => runWithTenant(tenant, fn);
  const full = {
    filters: '[{"field":"name","operator":"contains","value":"a"}]',
    sortDescriptor: '{"field":"name","direction":"asc"}',
    grouping: '{"field":"stage"}',
    columnWidths: '{"name":120}',
  };

  const createView = async (owner: string, deleted = false) => {
    const id = randomUUID();
    await client.query(
      `INSERT INTO "DataView" (id, "companyId", "userId", "surfaceKey", name, filters, "searchTerm", "sortDescriptor", "viewMode",
        grouping, "groupingColumnId", "columnOrder", "columnWidths", "hiddenColumns", "pageSize", "deletedAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, 'term', $7::jsonb, 'card', $8::jsonb, 'stage', '["a","b"]'::jsonb, $9::jsonb,
        '["c"]'::jsonb, 50, $10, '2020-01-01T00:00:00Z')`,
      [
        id,
        companyId,
        owner,
        surfaceKey,
        `View ${id}`,
        full.filters,
        full.sortDescriptor,
        full.grouping,
        full.columnWidths,
        deleted ? new Date() : null,
      ],
    );
    return id;
  };
  const view = async (id: string) =>
    (await client.query(`SELECT ${STATE_COLUMNS}, "pageSize" FROM "DataView" WHERE id = $1`, [id])).rows[0];
  const personalization = async () =>
    (
      await client.query(
        `SELECT ${STATE_COLUMNS}, "pagination" IS NULL AS "paginationNull", "viewStateKeys"::text AS "viewStateKeys"
         FROM "P13n" WHERE "companyId" = $1 AND "userId" = $2 AND "p13nId" = $3`,
        [companyId, userId, surfaceKey],
      )
    ).rows[0];

  beforeAll(async () => {
    await client.connect();
    await client.query('INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, CURRENT_TIMESTAMP)', [companyId]);
    for (const id of [userId, otherUserId]) {
      await client.query(
        'INSERT INTO "User" ("id", "email", "firstName", "lastName", "companyId", "updatedAt") VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)',
        [id, `reset-${id}@example.invalid`, "Reset", "Test", companyId],
      );
    }
  }, 60000);

  afterAll(async () => {
    await client.query('DELETE FROM "DataView" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "P13n" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "User" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "Company" WHERE "id" = $1', [companyId]);
    await client.end();
  });

  it("clears only the requested columns of an owned live view", async () => {
    const id = await createView(userId);
    const reset = await asTenant(() =>
      createTestDataViewRepo().resetOwnedViewState({
        surfaceKey,
        viewKey: id,
        fields: ["grouping", "pageSize", "columnOrder", "filters", "searchTerm"],
      }),
    );
    expect(reset).toBe(true);
    const row = await view(id);
    expect(row).toMatchObject({
      filtersNull: true,
      searchTerm: null,
      sortNull: false,
      viewMode: "card",
      groupingNull: true,
      groupingColumnId: null,
      columnOrder: null,
      widthsNull: false,
      hiddenColumns: '["c"]',
      pageSize: null,
    });
    expect(row.updatedAt.getTime()).toBeGreaterThan(new Date("2020-01-02T00:00:00Z").getTime());

    const rest = await asTenant(() =>
      createTestDataViewRepo().resetOwnedViewState({
        surfaceKey,
        viewKey: id,
        fields: ["sortDescriptor", "viewMode", "columnWidths", "hiddenColumns"],
      }),
    );
    expect(rest).toBe(true);
    expect(await view(id)).toMatchObject({ sortNull: true, viewMode: null, widthsNull: true, hiddenColumns: null });
  });

  it("refuses trashed views, other owners' views and other surfaces", async () => {
    const trashed = await createView(userId, true);
    const foreign = await createView(otherUserId);
    const reset = (viewKey: string, surface = surfaceKey) =>
      asTenant(() =>
        createTestDataViewRepo().resetOwnedViewState({ surfaceKey: surface, viewKey, fields: ["filters"] }),
      );
    expect(await reset(trashed)).toBe(false);
    expect(await reset(foreign)).toBe(false);
    expect(await reset(await createView(userId), `records:${randomUUID()}` as const)).toBe(false);
    expect(await view(trashed)).toMatchObject({ filtersNull: false });
    expect(await view(foreign)).toMatchObject({ filtersNull: false });
  });

  it("resets the All view personalization with empty column arrays and the remaining state keys", async () => {
    await client.query(
      `INSERT INTO "P13n" (id, "companyId", "userId", "p13nId", filters, "searchTerm", "sortDescriptor", pagination, "columnOrder",
        "columnWidths", "hiddenColumns", "viewMode", grouping, "groupingColumnId", "viewStateKeys", "updatedAt")
       VALUES ($1, $2, $3, $4, $5::jsonb, 'term', $6::jsonb, '{"pageSize":50}'::jsonb, ARRAY['a','b'], $7::jsonb, ARRAY['c'],
        'card', $8::jsonb, 'stage', '["filters","pageSize","columnOrder","grouping","viewMode"]'::jsonb, '2020-01-01T00:00:00Z')`,
      [
        randomUUID(),
        companyId,
        userId,
        surfaceKey,
        full.filters,
        full.sortDescriptor,
        full.columnWidths,
        full.grouping,
      ],
    );
    const reset = await asTenant(() =>
      createTestDataViewRepo().resetOwnedViewState({
        surfaceKey,
        viewKey: ALL_VIEW_KEY,
        fields: ["pageSize", "columnOrder", "hiddenColumns", "grouping", "searchTerm"],
      }),
    );
    expect(reset).toBe(true);
    const row = await personalization();
    expect(row).toMatchObject({
      filtersNull: false,
      searchTerm: null,
      paginationNull: true,
      columnOrder: "{}",
      hiddenColumns: "{}",
      groupingNull: true,
      groupingColumnId: null,
      viewMode: "card",
      widthsNull: false,
      viewStateKeys: '["filters", "viewMode"]',
    });
    expect(row.updatedAt.getTime()).toBeGreaterThan(new Date("2020-01-02T00:00:00Z").getTime());
  });

  it("treats a missing All personalization as already reset", async () => {
    expect(
      await asTenant(() =>
        createTestDataViewRepo().resetOwnedViewState({
          surfaceKey: `records:${randomUUID()}` as const,
          viewKey: ALL_VIEW_KEY,
          fields: ["filters"],
        }),
      ),
    ).toBe(true);
  });
});
