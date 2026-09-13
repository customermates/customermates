import type { TenantUser } from "@/features/user/user.schema";
import type { GroupableFieldSpec } from "@/core/base/grouping/groupable-field";

import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { Action, Resource } from "@/generated/prisma";

import { NO_VALUE_GROUP_KEY } from "@/core/base/grouping/grouping.schema";
import { PrismaRoutineRepo } from "../prisma-routine.repository";
import { relationGroupable } from "@/core/base/grouping/groupable-field";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUserWithPermissions } from "@/tests/helpers/mock-user";
import { runWithTenant } from "@/core/decorators/tenant-context";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase("grouped routine reads on PostgreSQL", () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const companyId = randomUUID();
  const otherCompanyId = randomUUID();
  const viewerId = randomUUID();
  const colleagueId = randomUUID();

  const routines = {
    viewerFirst: randomUUID(),
    viewerSecond: randomUUID(),
    colleagueOnly: randomUUID(),
    ownerless: randomUUID(),
    otherCompany: randomUUID(),
  };

  function userWith(permissions: Array<{ resource: Resource; action: Action }>): TenantUser {
    return { ...createMockUserWithPermissions(permissions), id: viewerId, companyId };
  }

  const readAll = userWith([
    { resource: Resource.routines, action: Action.readAll },
    { resource: Resource.users, action: Action.readAll },
  ]);

  const readOwn = userWith([
    { resource: Resource.routines, action: Action.readOwn },
    { resource: Resource.users, action: Action.readAll },
  ]);

  const withoutUsers = userWith([{ resource: Resource.routines, action: Action.readAll }]);

  function ownerSpec(): GroupableFieldSpec {
    return relationGroupable({ model: "routine", field: "ownerUserId" });
  }

  async function axis(user: TenantUser) {
    return runWithTenant(user, async () => {
      const repo = new PrismaRoutineRepo();
      const spec = ownerSpec();
      const rows = await repo.countByGroup({ spec, params: {}, now: new Date().toISOString() });

      const pages = await Promise.all(
        rows.map(async (row) => ({
          key: row.key,
          count: row.count,
          ids: (await repo.getItems({ groupScope: { spec, key: row.key }, take: 100, skip: 0 })).map((item) => item.id),
        })),
      );

      return { rows, pages, total: await repo.getCount({}) };
    });
  }

  beforeAll(async () => {
    await client.connect();
    for (const id of [companyId, otherCompanyId])
      await client.query('INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, CURRENT_TIMESTAMP)', [id]);

    for (const [id, first, company] of [
      [viewerId, "Viewer", companyId],
      [colleagueId, "Colleague", companyId],
    ] as const) {
      await client.query(
        'INSERT INTO "User" ("id", "email", "firstName", "lastName", "companyId", "updatedAt") VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)',
        [id, `${id}@example.com`, first, "Person", company],
      );
    }

    const rows: Array<[string, string | null, string, boolean]> = [
      [routines.viewerFirst, viewerId, companyId, true],
      [routines.viewerSecond, viewerId, companyId, true],
      [routines.colleagueOnly, colleagueId, companyId, true],
      [routines.ownerless, null, companyId, false],
      [routines.otherCompany, null, otherCompanyId, false],
    ];

    for (const [id, ownerUserId, company, enabled] of rows) {
      await client.query(
        `INSERT INTO "Routine" ("id", "companyId", "ownerUserId", "name", "prompt", "triggerKind", "enabled", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, 'schedule'::"RoutineTriggerKind", $6, CURRENT_TIMESTAMP)`,
        [id, company, ownerUserId, `routine ${id}`, "Summarise the pipeline.", enabled],
      );
    }
  });

  afterAll(async () => {
    await client.query('DELETE FROM "Routine" WHERE "companyId" = ANY($1)', [[companyId, otherCompanyId]]);
    await client.query('DELETE FROM "User" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "Company" WHERE "id" = ANY($1)', [[companyId, otherCompanyId]]);
    await client.end();
  });

  it("counts routines per owner instead of returning an empty axis", async () => {
    const { rows, pages, total } = await axis(readAll);

    expect(total).toBe(4);
    expect(new Map(rows.map((row) => [row.key, row.count]))).toEqual(
      new Map([
        [viewerId, 2],
        [colleagueId, 1],
        [NO_VALUE_GROUP_KEY, 1],
      ]),
    );
    expect(new Map(pages.map((page) => [page.key, page.ids.sort()]))).toEqual(
      new Map([
        [viewerId, [routines.viewerFirst, routines.viewerSecond].sort()],
        [colleagueId, [routines.colleagueOnly]],
        [NO_VALUE_GROUP_KEY, [routines.ownerless]],
      ]),
    );
  });

  it("never counts a routine belonging to another company", async () => {
    const { pages } = await axis(readAll);

    expect(pages.flatMap((page) => page.ids)).not.toContain(routines.otherCompany);
  });

  it("shows an owner only their own routines when they hold readOwn", async () => {
    const { rows, pages, total } = await axis(readOwn);

    expect(total).toBe(2);
    expect(rows).toEqual([{ key: viewerId, count: 2 }]);
    expect(pages[0]?.ids.sort()).toEqual([routines.viewerFirst, routines.viewerSecond].sort());
  });

  it("declares no owner grouping to a reader who cannot read users", async () => {
    const declared = await runWithTenant(withoutUsers, () => new PrismaRoutineRepo().getGroupableFields());

    expect(declared.map((spec) => spec.field)).toEqual(["createdAt", "updatedAt"]);
  });
});
