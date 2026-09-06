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
import { ViewMode } from "@/core/base/base-query-builder";
import { PrismaP13nRepo } from "@/features/p13n/prisma-p13n.repository";

import { PrismaDataViewRepo } from "../prisma-data-view.repository";
import { SaveDataViewStateInteractor } from "../save-data-view-state.interactor";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

const SURFACE = "contacts-card-store";

describeDatabase("data view user isolation on PostgreSQL", () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const companyId = randomUUID();
  const ownerId = randomUUID();
  const colleagueId = randomUUID();

  const tenant = (id: string): TenantUser => createMockUser({ id, companyId });
  const asOwner = <T>(fn: () => Promise<T>) => runWithTenant(tenant(ownerId), fn);
  const asColleague = <T>(fn: () => Promise<T>) => runWithTenant(tenant(colleagueId), fn);

  const views = () => new PrismaDataViewRepo();
  const saver = () => new SaveDataViewStateInteractor(views(), new PrismaP13nRepo());

  let viewId = "";

  async function rowSnapshot(id: string) {
    const res = await client.query('SELECT row_to_json(d) AS row FROM "DataView" d WHERE "id" = $1', [id]);
    return res.rows[0]?.row ?? null;
  }

  beforeAll(async () => {
    await import("@/core/di");
    await client.connect();
    await client.query('INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, CURRENT_TIMESTAMP)', [companyId]);
    await client.query(
      'INSERT INTO "User" ("id", "email", "firstName", "lastName", "companyId", "updatedAt") VALUES ($1, $2, $3, $4, $7, CURRENT_TIMESTAMP), ($5, $6, $8, $4, $7, CURRENT_TIMESTAMP)',
      [
        ownerId,
        `owner-${ownerId}@example.invalid`,
        "Sofia",
        "Rossi",
        colleagueId,
        `colleague-${colleagueId}@example.invalid`,
        companyId,
        "Max",
      ],
    );

    const created = await asOwner(() =>
      views().createView({
        surfaceKey: SURFACE,
        name: "Hot leads",
        position: 0,
        state: { filters: [], searchTerm: "acme", viewMode: ViewMode.card, columnWidths: { name: 220 } },
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

  it("shows the owner their view through every read", async () => {
    expect((await asOwner(() => views().listDataViews(SURFACE))).map(({ id }) => id)).toEqual([viewId]);
    expect(await asOwner(() => views().findOwnedOrNull(viewId))).toMatchObject({ id: viewId, name: "Hot leads" });
    expect((await asOwner(() => views().loadSurfaceState(SURFACE))).views.map(({ id }) => id)).toEqual([viewId]);
  });

  it("hides the view from a colleague in the same company through every read", async () => {
    expect(await asColleague(() => views().listDataViews(SURFACE))).toEqual([]);
    expect(await asColleague(() => views().findOwnedOrNull(viewId))).toBeNull();
    expect(await asColleague(() => views().loadSurfaceState(SURFACE))).toEqual({
      activeViewKey: null,
      views: [],
      allState: {},
    });
  });

  it("gives the colleague no write onto the view and leaves the row byte for byte as it was", async () => {
    const before = await rowSnapshot(viewId);

    expect(await asColleague(() => views().updateOwned({ id: viewId, name: "Stolen" }))).toBeNull();
    expect(
      await asColleague(() => views().updateOwnedState({ id: viewId, surfaceKey: SURFACE, state: { pageSize: 10 } })),
    ).toBe(false);
    const saved = await asColleague(() =>
      saver().invoke({ surfaceKey: SURFACE, viewKey: viewId, state: { pageSize: 10 } }),
    );
    expect(saved.ok).toBe(false);
    expect(await asColleague(() => views().deleteOwned(viewId))).toBe(false);

    expect(await rowSnapshot(viewId)).toEqual(before);
  });

  it("keeps the All tab state personal to each user of the surface", async () => {
    await asOwner(() => saver().invoke({ surfaceKey: SURFACE, viewKey: ALL_VIEW_KEY, state: { pageSize: 10 } }));

    expect((await asOwner(() => views().loadSurfaceState(SURFACE))).allState).toEqual({
      pageSize: 10,
      columnOrder: [],
      hiddenColumns: [],
    });
    expect((await asColleague(() => views().loadSurfaceState(SURFACE))).allState).toEqual({});
  });

  it("lets the colleague keep a view of their own with the same name without seeing the owner's", async () => {
    const own = await asColleague(() =>
      views().createView({ surfaceKey: SURFACE, name: "Hot leads", position: 0, state: {} }),
    );

    expect(own.id).not.toBe(viewId);
    expect((await asColleague(() => views().listDataViews(SURFACE))).map(({ id }) => id)).toEqual([own.id]);
    expect((await asOwner(() => views().listDataViews(SURFACE))).map(({ id }) => id)).toEqual([viewId]);
    expect(await asOwner(() => views().findOwnedOrNull(own.id))).toBeNull();

    await asColleague(() => views().deleteOwned(own.id));
  });
});
