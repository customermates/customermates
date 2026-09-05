import type { OperatorActor } from "@/core/decorators/operator-context";
import type { Filter } from "@/core/base/base-get.schema";
import type { DataViewState } from "@/core/data-view/data-view-state.schema";
import type { OperatorUserRowDto } from "../operator-lists.schema";

import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { MOCK_ZOD_MODULE } from "@/tests/helpers/interactor-test-setup";

vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);

import { runWithOperator } from "@/core/decorators/operator-context";
import { runWithTenant, tenantStorage } from "@/core/decorators/tenant-context";
import { createMockUser } from "@/tests/helpers/mock-user";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { BaseGetInteractor } from "@/core/base/base-get.interactor";
import { FilterOperatorKey, ViewMode } from "@/core/base/base-query-builder";
import { NO_VALUE_GROUP_KEY } from "@/core/base/grouping/grouping.schema";
import { ALL_VIEW_KEY, SURFACE } from "@/core/data-view/data-view-keys";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { PrismaDataViewRepo } from "@/features/data-view/prisma-data-view.repository";
import { PrismaP13nRepo } from "@/features/p13n/prisma-p13n.repository";
import { SaveDataViewStateInteractor } from "@/features/data-view/save-data-view-state.interactor";
import { PrismaOperatorUsersRepo } from "../prisma-operator-users.repository";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

const OPERATOR_SURFACE = SURFACE.operatorUsers;

describeDatabase("operator data view keying on PostgreSQL", () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });

  const companyIdA = randomUUID();
  const companyIdB = randomUUID();
  const operatorIdA = randomUUID();
  const operatorIdB = randomUUID();

  const actor = (userId: string, companyId: string): OperatorActor => ({
    authUserId: `auth-${userId}`,
    userId,
    companyId,
    email: `${userId}@operator.invalid`,
  });

  const actorA = actor(operatorIdA, companyIdA);
  const actorB = actor(operatorIdB, companyIdB);

  const views = () => new PrismaDataViewRepo();
  const saveAllTab = (userId: string, companyId: string, state: DataViewState) =>
    runWithTenant(createMockUser({ id: userId, companyId }), () =>
      new SaveDataViewStateInteractor(views(), new PrismaP13nRepo()).invoke({
        surfaceKey: OPERATOR_SURFACE,
        viewKey: ALL_VIEW_KEY,
        state,
      }),
    );

  class GroupedOperatorUsers extends BaseGetInteractor<OperatorUserRowDto> {
    constructor() {
      super(new PrismaOperatorUsersRepo(), views(), "interactive", undefined, {
        sortDescriptor: { field: "createdAt", direction: "desc" },
        pagination: { pageSize: 25, page: 1 },
      });
    }
  }

  const ownWorkspaces = (): Filter => ({
    field: FilterFieldKey.workspaceId,
    operator: FilterOperatorKey.in,
    value: [companyIdA, companyIdB],
  });

  beforeAll(async () => {
    await import("@/core/di");
    await client.connect();
    await client.query(
      'INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, CURRENT_TIMESTAMP), ($2, CURRENT_TIMESTAMP)',
      [companyIdA, companyIdB],
    );
    await client.query(
      `INSERT INTO "User" ("id", "email", "firstName", "lastName", "companyId", "status", "isPlatformOperator", "updatedAt")
       VALUES ($1, $2, 'Ada', 'Operator', $3, 'active', true, CURRENT_TIMESTAMP),
              ($4, $5, 'Bo', 'Operator', $6, 'active', true, CURRENT_TIMESTAMP)`,
      [
        operatorIdA,
        `${operatorIdA}@operator.invalid`,
        companyIdA,
        operatorIdB,
        `${operatorIdB}@operator.invalid`,
        companyIdB,
      ],
    );
  }, 60000);

  afterAll(async () => {
    const ids = [companyIdA, companyIdB];
    await client.query('DELETE FROM "DataView" WHERE "companyId" = ANY($1)', [ids]);
    await client.query('DELETE FROM "P13n" WHERE "companyId" = ANY($1)', [ids]);
    await client.query('DELETE FROM "User" WHERE "companyId" = ANY($1)', [ids]);
    await client.query('DELETE FROM "Company" WHERE "id" = ANY($1)', [ids]);
    await client.end();
  });

  it("loads an operator surface under runWithOperator with no ambient tenant frame", async () => {
    expect(tenantStorage.getStore()).toBeUndefined();

    const surface = await runWithOperator(actorA, () => views().loadSurfaceState(OPERATOR_SURFACE));

    expect(surface).toEqual({ activeViewKey: null, views: [], allState: {} });
    expect(tenantStorage.getStore()).toBeUndefined();
  });

  it("gives two operators in different workspaces independent views on the same surface", async () => {
    const ownA = await runWithOperator(actorA, () =>
      views().createView({
        surfaceKey: OPERATOR_SURFACE,
        name: "Inactive accounts",
        position: 0,
        state: { pageSize: 10 },
      }),
    );
    const ownB = await runWithOperator(actorB, () =>
      views().createView({
        surfaceKey: OPERATOR_SURFACE,
        name: "Recent signups",
        position: 0,
        state: { pageSize: 100 },
      }),
    );

    const seenByA = await runWithOperator(actorA, () => views().loadSurfaceState(OPERATOR_SURFACE));
    const seenByB = await runWithOperator(actorB, () => views().loadSurfaceState(OPERATOR_SURFACE));

    expect(seenByA.views.map((view) => view.id)).toEqual([ownA.id]);
    expect(seenByB.views.map((view) => view.id)).toEqual([ownB.id]);
    expect(await runWithOperator(actorB, () => views().findOwnedOrNull(ownA.id))).toBeNull();
    expect(
      await runWithOperator(actorB, () =>
        views().updateOwnedState({ id: ownA.id, surfaceKey: OPERATOR_SURFACE, state: { pageSize: 100 } }),
      ),
    ).toBe(false);
    expect(await runWithOperator(actorB, () => views().deleteOwned(ownA.id))).toBe(false);
  });

  it("keys the personal All tab state by the acting operator's own workspace", async () => {
    expect((await saveAllTab(operatorIdA, companyIdA, { pageSize: 10 })).ok).toBe(true);
    expect((await saveAllTab(operatorIdB, companyIdB, { pageSize: 100 })).ok).toBe(true);

    const seenByA = await runWithOperator(actorA, () => views().loadSurfaceState(OPERATOR_SURFACE));
    const seenByB = await runWithOperator(actorB, () => views().loadSurfaceState(OPERATOR_SURFACE));

    expect(seenByA.allState).toMatchObject({ pageSize: 10 });
    expect(seenByB.allState).toMatchObject({ pageSize: 100 });

    const rows = await client.query(
      'SELECT "companyId", "userId", "pagination" FROM "P13n" WHERE "p13nId" = $1 AND "companyId" = ANY($2) ORDER BY ("pagination"->>\'pageSize\')::int ASC',
      [OPERATOR_SURFACE, [companyIdA, companyIdB]],
    );
    expect(rows.rows).toEqual([
      { companyId: companyIdA, userId: operatorIdA, pagination: { pageSize: 10 } },
      { companyId: companyIdB, userId: operatorIdB, pagination: { pageSize: 100 } },
    ]);
  });

  it("serves a grouped operator request under runWithOperator with no ambient tenant frame", async () => {
    expect(tenantStorage.getStore()).toBeUndefined();

    const result = await runWithOperator(actorA, () =>
      new GroupedOperatorUsers().invoke({
        p13nId: OPERATOR_SURFACE,
        filters: [ownWorkspaces()],
        viewMode: ViewMode.card,
        grouping: { field: "status" },
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.groupableFields?.map(({ id }) => id)).toEqual([
      "status",
      "plan",
      "subscriptionStatus",
      "createdAt:day",
      "createdAt:week",
      "createdAt:month",
      "updatedAt:day",
      "updatedAt:week",
      "updatedAt:month",
    ]);
    expect(result.data.grouping?.groups.map(({ key, count }) => [key, count])).toEqual([
      ["active", 2],
      ["inactive", 0],
      ["pendingAuthorization", 0],
    ]);
    expect(result.data.items.map(({ id }) => id).sort()).toEqual([operatorIdA, operatorIdB].sort());
    expect(result.data.viewMode).toBe(ViewMode.card);
    expect(tenantStorage.getStore()).toBeUndefined();
  });

  it("applies the grouping persisted in the operator's own All tab and puts unsubscribed workspaces in the no-value group", async () => {
    expect(
      (
        await saveAllTab(operatorIdA, companyIdA, {
          pageSize: 10,
          viewMode: ViewMode.card,
          grouping: { field: "plan" },
        })
      ).ok,
    ).toBe(true);

    const result = await runWithOperator(actorA, () =>
      new GroupedOperatorUsers().invoke({ p13nId: OPERATOR_SURFACE, filters: [ownWorkspaces()] }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.grouping?.grouping).toEqual({ field: "plan" });
    expect(result.data.grouping?.groups.map(({ key, count }) => [key, count])).toEqual([
      ["starter", 0],
      ["pro", 0],
      ["business", 0],
      ["enterprise", 0],
      [NO_VALUE_GROUP_KEY, 2],
    ]);
    expect(result.data.grouping?.groups.at(-1)?.itemIds.sort()).toEqual([operatorIdA, operatorIdB].sort());

    const seenByB = await runWithOperator(actorB, () =>
      new GroupedOperatorUsers().invoke({ p13nId: OPERATOR_SURFACE, filters: [ownWorkspaces()] }),
    );
    expect(seenByB.ok).toBe(true);
    if (!seenByB.ok) return;
    expect(seenByB.data.grouping).toBeUndefined();
  });
});
