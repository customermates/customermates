import type { TenantUser } from "@/features/user/user.schema";

import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runWithTenant } from "@/core/decorators/tenant-context";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUser } from "@/tests/helpers/mock-user";
import { ViewMode } from "@/core/base/base-query-builder";

import { PrismaDataViewRepo } from "../prisma-data-view.repository";
import { PrismaDataViewOverrideRepo } from "../prisma-data-view-override.repository";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

const SURFACE = "contacts-card-store";

describeDatabase("data view sharing on PostgreSQL", () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const companyId = randomUUID();
  const ownerId = randomUUID();
  const readerId = randomUUID();

  const tenant = (id: string): TenantUser => createMockUser({ id, companyId });
  const asOwner = <T>(fn: () => Promise<T>) => runWithTenant(tenant(ownerId), fn);
  const asReader = <T>(fn: () => Promise<T>) => runWithTenant(tenant(readerId), fn);

  const views = () => new PrismaDataViewRepo();
  const overrides = () => new PrismaDataViewOverrideRepo();

  let viewId = "";

  async function rowSnapshot(id: string) {
    const res = await client.query('SELECT row_to_json(d) AS row FROM "DataView" d WHERE "id" = $1', [id]);
    return res.rows[0]?.row ?? null;
  }

  beforeAll(async () => {
    await client.connect();
    await client.query('INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, CURRENT_TIMESTAMP)', [companyId]);
    await client.query(
      'INSERT INTO "User" ("id", "email", "firstName", "lastName", "companyId", "updatedAt") VALUES ($1, $2, $3, $4, $7, CURRENT_TIMESTAMP), ($5, $6, $8, $4, $7, CURRENT_TIMESTAMP)',
      [
        ownerId,
        `owner-${ownerId}@example.invalid`,
        "Sofia",
        "Rossi",
        readerId,
        `reader-${readerId}@example.invalid`,
        companyId,
        "Max",
      ],
    );
  });

  afterAll(async () => {
    await client.query('DELETE FROM "DataViewOverride" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "DataView" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "P13n" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "User" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "Company" WHERE "id" = $1', [companyId]);
    await client.end();
  });

  it("hides a private view from a colleague in the same company", async () => {
    const created = await asOwner(() =>
      views().createView({
        surfaceKey: SURFACE,
        name: "Hot leads",
        visibility: "private",
        position: 0,
        state: { filters: [], searchTerm: "acme", viewMode: ViewMode.card, columnWidths: { name: 220 } },
      }),
    );
    viewId = created.id;

    expect(created.isOwner).toBe(true);
    expect(await asOwner(() => views().listDataViews(SURFACE))).toHaveLength(1);
    expect(await asReader(() => views().listDataViews(SURFACE))).toEqual([]);
    expect(await asReader(() => views().findViewById(viewId))).toBeNull();
  });

  it("shows the view to the colleague once it is shared with the workspace", async () => {
    await asOwner(() => views().updateOwned({ id: viewId, visibility: "workspace" }));

    const listed = await asReader(() => views().listDataViews(SURFACE));

    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ id: viewId, isOwner: false, ownerName: "Sofia Rossi" });
    expect(listed[0].state).toMatchObject({ searchTerm: "acme", viewMode: "card", columnWidths: { name: 220 } });
  });

  it("leaves the owner's row untouched when the reader overrides the shared view", async () => {
    const before = await rowSnapshot(viewId);

    await asReader(() =>
      overrides().upsertOverride({ surfaceKey: SURFACE, viewKey: viewId, delta: { columnWidths: { name: 400 } } }),
    );
    await asReader(() =>
      overrides().upsertOverride({ surfaceKey: SURFACE, viewKey: "__all__", delta: { pageSize: 10 } }),
    );

    expect(await rowSnapshot(viewId)).toEqual(before);

    const surface = await asReader(() => views().loadSurfaceState(SURFACE));
    expect(surface.overrides.get(viewId)).toEqual({ columnWidths: { name: 400 } });
    expect(surface.overrides.get("__all__")).toEqual({ pageSize: 10 });

    const ownerSurface = await asOwner(() => views().loadSurfaceState(SURFACE));
    expect(ownerSurface.overrides.size).toBe(0);
  });

  it("gives a non-owner no update and no delete on the shared view", async () => {
    expect(await asReader(() => views().updateOwned({ id: viewId, name: "Stolen" }))).toBeNull();
    expect(await asReader(() => views().deleteOwned(viewId))).toBe(false);
    expect(await asReader(() => views().findOwnedOrNull(viewId))).toBeNull();

    expect((await rowSnapshot(viewId)).name).toBe("Hot leads");
  });

  it("lets the non-owner duplicate the shared view into a copy they own", async () => {
    const source = await asReader(() => views().findViewById(viewId));
    const position = await asReader(() => views().nextPosition(SURFACE));
    const copy = await asReader(() =>
      views().createView({
        surfaceKey: SURFACE,
        name: "Hot leads copy",
        visibility: "private",
        position,
        state: source?.state ?? {},
      }),
    );

    expect(copy.isOwner).toBe(true);
    expect(copy.id).not.toBe(viewId);
    expect(copy.state).toEqual(source?.state);
    expect(await asOwner(() => views().findViewById(copy.id))).toBeNull();

    await asReader(() => views().deleteOwned(copy.id));
  });

  it("cascades away only the reader's override of the deleted view", async () => {
    expect(await asOwner(() => views().deleteOwned(viewId))).toBe(true);

    const remaining = await client.query('SELECT "viewKey" FROM "DataViewOverride" WHERE "companyId" = $1', [
      companyId,
    ]);

    expect(remaining.rows.map((row) => row.viewKey)).toEqual(["__all__"]);
  });

  it("removes an un-shared view from the colleague's list", async () => {
    const second = await asOwner(() =>
      views().createView({ surfaceKey: SURFACE, name: "Shared", visibility: "workspace", position: 1, state: {} }),
    );

    expect(await asReader(() => views().listDataViews(SURFACE))).toHaveLength(1);

    await asOwner(() => views().updateOwned({ id: second.id, visibility: "private" }));

    expect(await asReader(() => views().listDataViews(SURFACE))).toEqual([]);
    expect(await asReader(() => views().findViewById(second.id))).toBeNull();
  });
});
