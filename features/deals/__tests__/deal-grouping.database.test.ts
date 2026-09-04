import type { TenantUser } from "@/features/user/user.schema";
import type { GroupableFieldSpec } from "@/core/base/grouping/groupable-field";

import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { Action, CustomColumnType, EntityType, Resource } from "@/generated/prisma";

import { FilterFieldKey } from "@/core/types/filter-field-key";
import { MAX_AXIS_GROUPS, NO_VALUE_GROUP_KEY } from "@/core/base/grouping/grouping.schema";
import { PrismaDealRepo } from "../prisma-deal.repository";
import { PrismaTaskRepo } from "@/features/tasks/prisma-task.repository";
import { dateGroupable, enumGroupable, relationGroupable } from "@/core/base/grouping/groupable-field";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { resolveGroupAxis } from "@/core/base/grouping/group-axis";
import { createMockUserWithPermissions } from "@/tests/helpers/mock-user";
import { prisma } from "@/prisma/db";
import { runWithTenant } from "@/core/decorators/tenant-context";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

const STAGES = ["new", "proposal", "won"];

describeDatabase("grouped deal reads on PostgreSQL", () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const companyId = randomUUID();
  const columnId = randomUUID();
  const viewerId = randomUUID();
  const colleagueId = randomUUID();

  const deals = {
    newAssignedToViewer: randomUUID(),
    wonAssignedToBoth: randomUUID(),
    wonAssignedToColleague: randomUUID(),
    noValueRowAtAll: randomUUID(),
    explicitlyNullValue: randomUUID(),
    newUnassigned: randomUUID(),
  };

  const readAll: TenantUser = {
    ...createMockUserWithPermissions([
      { resource: Resource.deals, action: Action.readAll },
      { resource: Resource.users, action: Action.readAll },
      { resource: Resource.tasks, action: Action.readAll },
    ]),
    id: viewerId,
    companyId,
  };

  const readOwn: TenantUser = {
    ...createMockUserWithPermissions([
      { resource: Resource.deals, action: Action.readOwn },
      { resource: Resource.users, action: Action.readOwn },
    ]),
    id: viewerId,
    companyId,
  };

  function stageSpec(): GroupableFieldSpec {
    return {
      kind: "customSingleSelect",
      field: columnId,
      model: "deal",
      columnId,
      entityType: EntityType.deal,
      label: "Stage",
      options: STAGES.map((value, index) => ({
        value,
        label: value,
        color: "success" as const,
        isDefault: false,
        index,
      })),
    };
  }

  async function axisAndPages(user: TenantUser, spec: GroupableFieldSpec, bucket?: "day" | "week" | "month") {
    return runWithTenant(user, async () => {
      const repo = new PrismaDealRepo();
      const now = new Date().toISOString();
      const rows = await repo.countByGroup({ spec, params: {}, bucket, now });

      const pages = await Promise.all(
        rows.map(async (row) => ({
          key: row.key,
          count: row.count,
          ids: (await repo.getItems({ groupScope: { spec, key: row.key, bucket, now }, take: 100, skip: 0 })).map(
            (item) => item.id,
          ),
        })),
      );

      return { rows, pages, total: await repo.getCount({}) };
    });
  }

  beforeAll(async () => {
    await client.connect();
    await client.query('INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, CURRENT_TIMESTAMP)', [companyId]);

    for (const [id, first] of [
      [viewerId, "Viewer"],
      [colleagueId, "Colleague"],
    ] as const) {
      await client.query(
        'INSERT INTO "User" ("id", "email", "firstName", "lastName", "companyId", "updatedAt") VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)',
        [id, `${id}@example.com`, first, "Person", companyId],
      );
    }

    await client.query(
      'INSERT INTO "CustomColumn" ("id", "label", "type", "entityType", "options", "companyId", "updatedAt") VALUES ($1, $2, $3::"CustomColumnType", $4::"EntityType", $5::jsonb, $6, CURRENT_TIMESTAMP)',
      [
        columnId,
        "Stage",
        CustomColumnType.singleSelect,
        EntityType.deal,
        JSON.stringify({
          options: STAGES.map((value, index) => ({ value, label: value, color: "success", isDefault: false, index })),
        }),
        companyId,
      ],
    );

    for (const [name, id] of Object.entries(deals)) {
      await client.query(
        'INSERT INTO "Deal" ("id", "name", "totalValue", "totalQuantity", "companyId", "updatedAt") VALUES ($1, $2, 100, 1, $3, CURRENT_TIMESTAMP)',
        [id, name, companyId],
      );
    }

    const stageRows: Array<[string, string | null]> = [
      [deals.newAssignedToViewer, "new"],
      [deals.wonAssignedToBoth, "won"],
      [deals.wonAssignedToColleague, "won"],
      [deals.explicitlyNullValue, null],
      [deals.newUnassigned, "new"],
    ];

    for (const [dealId, value] of stageRows) {
      await client.query(
        'INSERT INTO "CustomFieldValue" ("id", "entityType", "columnId", "value", "type", "companyId", "dealId", "updatedAt") VALUES ($1, $2::"EntityType", $3, $4, $5::"CustomColumnType", $6, $7, CURRENT_TIMESTAMP)',
        [randomUUID(), EntityType.deal, columnId, value, CustomColumnType.singleSelect, companyId, dealId],
      );
    }

    const assignments: Array<[string, string]> = [
      [deals.newAssignedToViewer, viewerId],
      [deals.wonAssignedToBoth, viewerId],
      [deals.wonAssignedToBoth, colleagueId],
      [deals.wonAssignedToColleague, colleagueId],
      [deals.noValueRowAtAll, viewerId],
      [deals.explicitlyNullValue, viewerId],
    ];

    for (const [dealId, userId] of assignments) {
      await client.query(
        'INSERT INTO "DealUser" ("id", "dealId", "userId", "companyId", "updatedAt") VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)',
        [randomUUID(), dealId, userId, companyId],
      );
    }
  });

  afterAll(async () => {
    await client.query('DELETE FROM "DealUser" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "CustomFieldValue" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "Deal" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "CustomColumn" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "User" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "Company" WHERE "id" = $1', [companyId]);
    await client.end();
  });

  it("agrees between the count and the item page of every single select group", async () => {
    const { pages, total } = await axisAndPages(readAll, stageSpec());

    expect(pages.map((page) => [page.key, page.count, page.ids.length])).toEqual([
      ["new", 2, 2],
      ["won", 2, 2],
      [NO_VALUE_GROUP_KEY, 2, 2],
    ]);
    expect(total).toBe(6);
  });

  it("puts a row carrying an explicit null value in the empty group on both sides", async () => {
    const { pages } = await axisAndPages(readAll, stageSpec());
    const empty = pages.find((page) => page.key === NO_VALUE_GROUP_KEY);

    expect(new Set(empty?.ids)).toEqual(new Set([deals.noValueRowAtAll, deals.explicitlyNullValue]));
  });

  it("agrees on every relation group and lets membership exceed the flat total", async () => {
    const spec = relationGroupable({ model: "deal", field: FilterFieldKey.userIds });
    const { pages, total } = await axisAndPages(readAll, spec);
    const byKey = new Map(pages.map((page) => [page.key, page]));

    for (const page of pages) expect([page.key, page.count]).toEqual([page.key, page.ids.length]);

    expect(byKey.get(viewerId)?.count).toBe(4);
    expect(byKey.get(colleagueId)?.count).toBe(2);
    expect(byKey.get(NO_VALUE_GROUP_KEY)?.count).toBe(1);
    expect(pages.reduce((sum, page) => sum + page.count, 0)).toBeGreaterThan(total);
    expect(total).toBe(6);
  });

  it("hides a colleague's column from a readOwn viewer and scopes the unassigned count to what they can read", async () => {
    const spec = relationGroupable({ model: "deal", field: FilterFieldKey.userIds });
    const { pages, total } = await axisAndPages(readOwn, spec);

    expect(pages.map((page) => page.key)).toEqual([viewerId]);
    expect(pages[0].count).toBe(4);
    expect(total).toBe(4);
  });

  it("puts every deal in exactly one date bucket", async () => {
    const spec = dateGroupable({ model: "deal", field: FilterFieldKey.createdAt });
    const { pages, total } = await axisAndPages(readAll, spec, "month");
    const seen = pages.flatMap((page) => page.ids);

    for (const page of pages) expect([page.key, page.count]).toEqual([page.key, page.ids.length]);

    expect(seen).toHaveLength(new Set(seen).size);
    expect(seen).toHaveLength(total);
  });

  it("counts an enum axis in one query and agrees with the item page", async () => {
    const spec = enumGroupable({ model: "task", field: "type" });

    const measured = await runWithTenant(readAll, async () => {
      const repo = new PrismaTaskRepo();
      const rows = await repo.countByGroup({ spec, params: {} });

      return Promise.all(
        rows.map(async (row) => ({
          key: row.key,
          count: row.count,
          ids: (await repo.getItems({ groupScope: { spec, key: row.key }, take: 200, skip: 0 })).map((item) => item.id),
        })),
      );
    });

    for (const row of measured) expect([row.key, row.count]).toEqual([row.key, row.ids.length]);
  });

  it("returns an empty group rather than throwing for a group key the enum never declared", async () => {
    const spec = enumGroupable({ model: "task", field: "type" });

    const items = await runWithTenant(readAll, () =>
      new PrismaTaskRepo().getItems({ groupScope: { spec, key: "bogus_enum_value" }, take: 5, skip: 0 }),
    );

    expect(items).toEqual([]);
  });

  it("stops offering the owner grouping to a viewer who cannot read users at all", async () => {
    const dealsOnly: TenantUser = {
      ...createMockUserWithPermissions([{ resource: Resource.deals, action: Action.readAll }]),
      id: viewerId,
      companyId,
    };

    const fields = await runWithTenant(dealsOnly, () => new PrismaDealRepo().getGroupableFields());

    expect(fields.map((field) => field.field)).not.toContain(FilterFieldKey.userIds);
  });

  it("counts entities, not custom field value rows, when a duplicate row survived a concurrent write", async () => {
    const duplicateId = randomUUID();
    await client.query(
      'INSERT INTO "CustomFieldValue" ("id", "entityType", "columnId", "value", "type", "companyId", "dealId", "updatedAt") VALUES ($1, $2::"EntityType", $3, $4, $5::"CustomColumnType", $6, $7, CURRENT_TIMESTAMP)',
      [
        duplicateId,
        EntityType.deal,
        columnId,
        "new",
        CustomColumnType.singleSelect,
        companyId,
        deals.newAssignedToViewer,
      ],
    );

    const { pages } = await axisAndPages(readAll, stageSpec());
    await client.query('DELETE FROM "CustomFieldValue" WHERE "id" = $1', [duplicateId]);

    const created = pages.find((page) => page.key === "new");

    expect([created?.count, created?.ids.length]).toEqual([2, 2]);
  });

  it("rejects a where that buries companyId inside AND, which is why every fragment goes through withFragment", async () => {
    await expect(
      runWithTenant(readAll, () =>
        prisma.deal.count({
          where: { AND: [{ companyId }, { name: "x" }] } as never,
        }),
      ),
    ).rejects.toThrow("companyId must be set in where");
  });
});

describeDatabase("a relation axis wider than the cap", () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const companyId = randomUUID();
  const viewerId = randomUUID();
  const ownerCount = MAX_AXIS_GROUPS + 12;

  const readAll: TenantUser = {
    ...createMockUserWithPermissions([
      { resource: Resource.deals, action: Action.readAll },
      { resource: Resource.users, action: Action.readAll },
    ]),
    id: viewerId,
    companyId,
  };

  beforeAll(async () => {
    await client.connect();
    await client.query('INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, CURRENT_TIMESTAMP)', [companyId]);
    await client.query(
      'INSERT INTO "User" ("id", "email", "firstName", "lastName", "companyId", "updatedAt") VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)',
      [viewerId, `${viewerId}@example.com`, "Viewer", "Person", companyId],
    );

    for (let index = 0; index < ownerCount; index += 1) {
      const ownerId = randomUUID();
      const dealId = randomUUID();

      await client.query(
        'INSERT INTO "User" ("id", "email", "firstName", "lastName", "companyId", "updatedAt") VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)',
        [ownerId, `${ownerId}@example.com`, `Owner ${String(index).padStart(3, "0")}`, "Bulk", companyId],
      );
      await client.query(
        'INSERT INTO "Deal" ("id", "name", "totalValue", "totalQuantity", "companyId", "updatedAt") VALUES ($1, $2, 100, 1, $3, CURRENT_TIMESTAMP)',
        [dealId, `Deal ${index}`, companyId],
      );
      await client.query(
        'INSERT INTO "DealUser" ("id", "dealId", "userId", "companyId", "updatedAt") VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)',
        [randomUUID(), dealId, ownerId, companyId],
      );
    }
  });

  afterAll(async () => {
    await client.query('DELETE FROM "DealUser" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "Deal" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "User" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "Company" WHERE "id" = $1', [companyId]);
    await client.end();
  });

  it("reports the truncation instead of dropping the surplus owners in silence", async () => {
    const spec = relationGroupable({ model: "deal", field: FilterFieldKey.userIds });

    const axis = await runWithTenant(readAll, async () => {
      const repo = new PrismaDealRepo();
      const rows = await repo.countByGroup({ spec, params: {} });
      const labels = await repo.resolveGroupLabels(
        spec,
        rows.map((row) => row.key),
      );

      return resolveGroupAxis({ spec, rows, labels, collator: repo.collator() });
    });

    expect(axis.groups).toHaveLength(MAX_AXIS_GROUPS);
    expect(axis.overflow).toEqual({ shown: MAX_AXIS_GROUPS });
  });
});
