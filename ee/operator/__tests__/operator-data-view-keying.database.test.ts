import type { OperatorActor } from "@/core/decorators/operator-context";

import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { MOCK_ZOD_MODULE } from "@/tests/helpers/interactor-test-setup";

vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);

import { runWithOperator } from "@/core/decorators/operator-context";
import { runWithTenant, tenantStorage } from "@/core/decorators/tenant-context";
import { createMockUser } from "@/tests/helpers/mock-user";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { SURFACE } from "@/core/data-view/data-view-keys";
import { PrismaDataViewRepo } from "@/features/data-view/prisma-data-view.repository";
import { PrismaDataViewOverrideRepo } from "@/features/data-view/prisma-data-view-override.repository";
import { PrismaP13nRepo } from "@/features/p13n/prisma-p13n.repository";
import { UpsertDataViewInteractor } from "@/features/data-view/upsert-data-view.interactor";

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
  const overrides = () => new PrismaDataViewOverrideRepo();

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
    await client.query('DELETE FROM "DataViewOverride" WHERE "companyId" = ANY($1)', [ids]);
    await client.query('DELETE FROM "DataView" WHERE "companyId" = ANY($1)', [ids]);
    await client.query('DELETE FROM "P13n" WHERE "companyId" = ANY($1)', [ids]);
    await client.query('DELETE FROM "User" WHERE "companyId" = ANY($1)', [ids]);
    await client.query('DELETE FROM "Company" WHERE "id" = ANY($1)', [ids]);
    await client.end();
  });

  it("loads an operator surface under runWithOperator with no ambient tenant frame", async () => {
    expect(tenantStorage.getStore()).toBeUndefined();

    const surface = await runWithOperator(actorA, () => views().loadSurfaceState(OPERATOR_SURFACE));

    expect(surface).toEqual({ activeViewKey: null, views: [], overrides: new Map() });
    expect(tenantStorage.getStore()).toBeUndefined();
  });

  it("gives two operators in different workspaces independent views on the same surface", async () => {
    const ownA = await runWithOperator(actorA, () =>
      views().createView({
        surfaceKey: OPERATOR_SURFACE,
        name: "Inactive accounts",
        visibility: "private",
        position: 0,
        state: { pageSize: 10 },
      }),
    );
    const ownB = await runWithOperator(actorB, () =>
      views().createView({
        surfaceKey: OPERATOR_SURFACE,
        name: "Recent signups",
        visibility: "private",
        position: 0,
        state: { pageSize: 100 },
      }),
    );

    const seenByA = await runWithOperator(actorA, () => views().loadSurfaceState(OPERATOR_SURFACE));
    const seenByB = await runWithOperator(actorB, () => views().loadSurfaceState(OPERATOR_SURFACE));

    expect(seenByA.views.map((view) => view.id)).toEqual([ownA.id]);
    expect(seenByB.views.map((view) => view.id)).toEqual([ownB.id]);
    expect(await runWithOperator(actorB, () => views().findViewById(ownA.id))).toBeNull();
    expect(await runWithOperator(actorB, () => views().findOwnedOrNull(ownA.id))).toBeNull();
    expect(await runWithOperator(actorB, () => views().deleteOwned(ownA.id))).toBe(false);
  });

  it("keys the personal override by the acting operator's own workspace", async () => {
    await runWithOperator(actorA, () =>
      overrides().upsertOverride({ surfaceKey: OPERATOR_SURFACE, viewKey: "__all__", delta: { pageSize: 10 } }),
    );
    await runWithOperator(actorB, () =>
      overrides().upsertOverride({ surfaceKey: OPERATOR_SURFACE, viewKey: "__all__", delta: { pageSize: 100 } }),
    );

    const seenByA = await runWithOperator(actorA, () => views().loadSurfaceState(OPERATOR_SURFACE));
    const seenByB = await runWithOperator(actorB, () => views().loadSurfaceState(OPERATOR_SURFACE));

    expect(seenByA.overrides.get("__all__")).toEqual({ pageSize: 10 });
    expect(seenByB.overrides.get("__all__")).toEqual({ pageSize: 100 });

    const rows = await client.query(
      'SELECT "companyId", "userId", "pageSize" FROM "DataViewOverride" WHERE "surfaceKey" = $1 AND "companyId" = ANY($2) ORDER BY "pageSize" ASC',
      [OPERATOR_SURFACE, [companyIdA, companyIdB]],
    );
    expect(rows.rows).toEqual([
      { companyId: companyIdA, userId: operatorIdA, pageSize: 10 },
      { companyId: companyIdB, userId: operatorIdB, pageSize: 100 },
    ]);
  });

  it("coerces a workspace-visible operator view to private", async () => {
    const operatorUser = createMockUser({ id: operatorIdA, companyId: companyIdA });
    const interactor = new UpsertDataViewInteractor(views(), overrides(), new PrismaP13nRepo());

    const result = await runWithTenant(operatorUser, () =>
      interactor.invoke({
        surfaceKey: OPERATOR_SURFACE,
        name: "Shared attempt",
        visibility: "workspace",
        state: {},
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.visibility).toBe("private");

    const stored = await client.query('SELECT "visibility" FROM "DataView" WHERE "id" = $1', [result.data.id]);
    expect(stored.rows[0]?.visibility).toBe("private");
  });
});
