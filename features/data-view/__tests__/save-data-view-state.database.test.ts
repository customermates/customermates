import type { TenantUser } from "@/features/user/user.schema";
import type { Filter } from "@/core/base/base-get.schema";
import type { DataViewDefaultsLayer } from "@/core/data-view/resolve-data-view-state";

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
import { resolveDataViewState } from "@/core/data-view/resolve-data-view-state";
import { FilterOperatorKey, ViewMode } from "@/core/base/base-query-builder";
import { PrismaP13nRepo } from "@/features/p13n/prisma-p13n.repository";

import { PrismaDataViewRepo } from "../prisma-data-view.repository";
import { SaveDataViewStateInteractor } from "../save-data-view-state.interactor";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

const SURFACE = "deals-card-store";
const viewFilter: Filter = { field: "name", operator: FilterOperatorKey.contains, value: "acme" };
const surfaceDefaults: DataViewDefaultsLayer = {
  filters: [{ field: "name", operator: FilterOperatorKey.contains, value: "default" }],
  sortDescriptor: { field: "createdAt", direction: "desc" },
};

describeDatabase("data view state round trip on PostgreSQL", () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const companyId = randomUUID();
  const userId = randomUUID();

  const tenant: TenantUser = createMockUser({ id: userId, companyId });
  const asTenant = <T>(fn: () => Promise<T>) => runWithTenant(tenant, fn);
  const views = () => new PrismaDataViewRepo();
  const save = (viewKey: string, state: Parameters<SaveDataViewStateInteractor["invoke"]>[0]["state"]) =>
    asTenant(() =>
      new SaveDataViewStateInteractor(views(), new PrismaP13nRepo()).invoke({ surfaceKey: SURFACE, viewKey, state }),
    );

  let viewId = "";

  beforeAll(async () => {
    await import("@/core/di");
    await client.connect();
    await client.query('INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, CURRENT_TIMESTAMP)', [companyId]);
    await client.query(
      'INSERT INTO "User" ("id", "email", "firstName", "lastName", "companyId", "updatedAt") VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)',
      [userId, `round-trip-${userId}@example.invalid`, "Round", "Trip", companyId],
    );

    const created = await asTenant(() =>
      views().createView({
        surfaceKey: SURFACE,
        name: "Acme deals",
        position: 0,
        state: { filters: [viewFilter], sortDescriptor: { field: "name", direction: "asc" }, viewMode: ViewMode.card },
      }),
    );
    viewId = created.id;
  }, 60000);

  afterAll(async () => {
    await client.query('DELETE FROM "DataView" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "P13n" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "User" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "Company" WHERE "id" = $1', [companyId]);
    await client.end();
  });

  it("persists an emptied filter list on a named view and resolves it to no filters on the next read", async () => {
    const result = await save(viewId, {
      filters: [],
      searchTerm: "",
      sortDescriptor: { field: "name", direction: "asc" },
      pageSize: 25,
      viewMode: ViewMode.card,
      grouping: null,
      columnOrder: [],
      columnWidths: {},
      hiddenColumns: [],
    });
    expect(result).toEqual({ ok: true, data: { viewKey: viewId } });

    const stored = await client.query('SELECT "filters" FROM "DataView" WHERE "id" = $1', [viewId]);
    expect(stored.rows[0]?.filters).toEqual([]);

    const surface = await asTenant(() => views().loadSurfaceState(SURFACE));
    const view = surface.views.find(({ id }) => id === viewId);
    expect(view?.state.filters).toEqual([]);

    const resolved = resolveDataViewState({ params: {}, base: view?.state, defaults: surfaceDefaults });
    expect(resolved.filters).toEqual([]);
    expect(resolved.sortDescriptor).toEqual({ field: "name", direction: "asc" });
    expect(resolved.pageSize).toBe(25);
  });

  it("persists a cleared sort on a named view as a present null that floors on the surface default", async () => {
    await save(viewId, { filters: [], sortDescriptor: null });

    const surface = await asTenant(() => views().loadSurfaceState(SURFACE));
    const view = surface.views.find(({ id }) => id === viewId);

    expect(view?.state).toMatchObject({ filters: [], sortDescriptor: null });
    expect(resolveDataViewState({ base: view?.state, defaults: surfaceDefaults }).sortDescriptor).toEqual(
      surfaceDefaults.sortDescriptor,
    );
  });

  it("leaves a key the payload omits alone on a named view and on the All tab alike", async () => {
    await save(viewId, { pageSize: 25, viewMode: ViewMode.card, columnWidths: { name: 240 } });
    await save(ALL_VIEW_KEY, { pageSize: 25, viewMode: ViewMode.card, columnWidths: { name: 240 } });

    await save(viewId, { filters: [], searchTerm: "" });
    await save(ALL_VIEW_KEY, { filters: [], searchTerm: "" });

    const surface = await asTenant(() => views().loadSurfaceState(SURFACE));
    const view = surface.views.find(({ id }) => id === viewId);
    const kept = { pageSize: 25, viewMode: ViewMode.card, columnWidths: { name: 240 }, filters: [], searchTerm: "" };

    expect(view?.state).toMatchObject(kept);
    expect(surface.allState).toMatchObject(kept);
  });

  it("persists an emptied filter list on the All tab into personalization and resolves it to no filters", async () => {
    await save(ALL_VIEW_KEY, { filters: [viewFilter], pageSize: 10 });
    expect((await asTenant(() => views().loadSurfaceState(SURFACE))).allState).toMatchObject({
      filters: [viewFilter],
      pageSize: 10,
    });

    await save(ALL_VIEW_KEY, { filters: [], pageSize: 10 });

    const stored = await client.query(
      'SELECT "filters", "pagination" FROM "P13n" WHERE "companyId" = $1 AND "userId" = $2 AND "p13nId" = $3',
      [companyId, userId, SURFACE],
    );
    expect(stored.rows[0]).toEqual({ filters: [], pagination: { pageSize: 10 } });

    const surface = await asTenant(() => views().loadSurfaceState(SURFACE));
    expect(surface.allState.filters).toEqual([]);
    expect(resolveDataViewState({ base: surface.allState, defaults: surfaceDefaults }).filters).toEqual([]);
  });
});
