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
import { PrismaP13nRepo } from "@/features/p13n/prisma-p13n.repository";

import { HideSharedDataViewInteractor } from "../hide-shared-data-view.interactor";
import { SelectDataViewInteractor } from "../select-data-view.interactor";
import { ShareDataViewInteractor } from "../share-data-view.interactor";
import { createTestDataViewRepo } from "@/tests/helpers/record-repository";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

const SURFACE = "webhooks-card-store";

describeDatabase("shared data views on PostgreSQL", () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const companyId = randomUUID();
  const otherCompanyId = randomUUID();
  const salesRoleId = randomUUID();
  const supportRoleId = randomUUID();
  const foreignRoleId = randomUUID();
  const ownerId = randomUUID();
  const salesId = randomUUID();
  const supportId = randomUUID();
  const outsiderId = randomUUID();

  const role = (id: string, name: string) => ({
    id,
    name,
    description: null,
    isSystemRole: false,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    permissions: [],
  });
  const tenant = (id: string, company: string, roleId: string, roleName: string): TenantUser =>
    createMockUser({ id, companyId: company, roleId, role: role(roleId, roleName) });
  const as =
    (user: TenantUser) =>
    <T>(fn: () => Promise<T>) =>
      runWithTenant(user, fn);
  const asOwner = as(tenant(ownerId, companyId, salesRoleId, "Sales"));
  const asSales = as(tenant(salesId, companyId, salesRoleId, "Sales"));
  const asSupport = as(tenant(supportId, companyId, supportRoleId, "Support"));
  const asOutsider = as(tenant(outsiderId, otherCompanyId, foreignRoleId, "Sales"));

  const views = () => createTestDataViewRepo();
  const share = () => new ShareDataViewInteractor(views());
  const visibleIds = async (asUser: typeof asOwner) =>
    (await asUser(() => views().loadSurfaceState(SURFACE))).views.map(({ id }) => id);

  let viewId = "";

  beforeAll(async () => {
    await import("@/core/di");
    await client.connect();
    await client.query(
      'INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, CURRENT_TIMESTAMP), ($2, CURRENT_TIMESTAMP)',
      [companyId, otherCompanyId],
    );
    await client.query(
      'INSERT INTO "UserRole" ("id", "name", "companyId", "updatedAt") VALUES ($1, $2, $3, CURRENT_TIMESTAMP), ($4, $5, $3, CURRENT_TIMESTAMP), ($6, $2, $7, CURRENT_TIMESTAMP)',
      [salesRoleId, "Sales", companyId, supportRoleId, "Support", foreignRoleId, otherCompanyId],
    );
    for (const [id, first, company, roleId] of [
      [ownerId, "Clara", companyId, salesRoleId],
      [salesId, "Max", companyId, salesRoleId],
      [supportId, "Sofia", companyId, supportRoleId],
      [outsiderId, "Olga", otherCompanyId, foreignRoleId],
    ]) {
      await client.query(
        'INSERT INTO "User" ("id", "email", "firstName", "lastName", "companyId", "roleId", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)',
        [id, `${first.toLowerCase()}-${id}@example.invalid`, first, "Neumann", company, roleId],
      );
    }

    viewId = (
      await asOwner(() => views().createView({ surfaceKey: SURFACE, name: "Pipeline Q4", position: 0, state: {} }))
    ).id;
  }, 60000);

  afterAll(async () => {
    for (const id of [companyId, otherCompanyId]) {
      await client.query('DELETE FROM "DataView" WHERE "companyId" = $1', [id]);
      await client.query('DELETE FROM "P13n" WHERE "companyId" = $1', [id]);
      await client.query('DELETE FROM "User" WHERE "companyId" = $1', [id]);
      await client.query('DELETE FROM "UserRole" WHERE "companyId" = $1', [id]);
      await client.query('DELETE FROM "Company" WHERE "id" = $1', [id]);
    }
    await client.end();
  });

  it("keeps a new view private to its owner", async () => {
    expect(await visibleIds(asOwner)).toEqual([viewId]);
    expect(await visibleIds(asSales)).toEqual([]);
    expect(await visibleIds(asSupport)).toEqual([]);
  });

  it("shares with every member of the workspace and names the owner, never with another workspace", async () => {
    expect((await asOwner(() => share().invoke({ id: viewId, visibility: "workspace", roleIds: [] }))).ok).toBe(true);

    const salesSurface = await asSales(() => views().loadSurfaceState(SURFACE));
    expect(salesSurface.views).toEqual([
      expect.objectContaining({
        id: viewId,
        visibility: "workspace",
        sharedBy: { id: ownerId, name: "Clara Neumann", avatarUrl: null },
      }),
    ]);
    expect(await visibleIds(asSupport)).toEqual([viewId]);
    expect(await visibleIds(asOutsider)).toEqual([]);
    expect(await asOutsider(() => views().findReadableOrNull(viewId))).toBeNull();
  });

  it("shares with a selected role only", async () => {
    const result = await asOwner(() => share().invoke({ id: viewId, visibility: "roles", roleIds: [salesRoleId] }));

    expect(result).toMatchObject({ ok: true, data: { visibility: "roles", roleIds: [salesRoleId] } });
    expect(await visibleIds(asSales)).toEqual([viewId]);
    expect(await visibleIds(asSupport)).toEqual([]);
  });

  it("refuses a role of another workspace and keeps the current sharing", async () => {
    const result = await asOwner(() => share().invoke({ id: viewId, visibility: "roles", roleIds: [foreignRoleId] }));

    expect(result.ok).toBe(false);
    expect(await visibleIds(asSales)).toEqual([viewId]);
  });

  it("lets a teammate select the shared view but never change, move to Trash or reshare it", async () => {
    const select = new SelectDataViewInteractor(views(), new PrismaP13nRepo());
    expect(await asSales(() => select.invoke({ surfaceKey: SURFACE, viewKey: viewId }))).toEqual({
      ok: true,
      data: { activeViewKey: viewId },
    });
    expect((await asSupport(() => select.invoke({ surfaceKey: SURFACE, viewKey: viewId }))).ok).toBe(false);

    expect(await asSales(() => views().updateOwned({ id: viewId, name: "Taken" }))).toBeNull();
    expect(await asSales(() => views().trashOwned(viewId))).toBe(false);
    expect((await asSales(() => share().invoke({ id: viewId, visibility: "private", roleIds: [] }))).ok).toBe(false);
    expect(await asOwner(() => views().findOwnedOrNull(viewId))).toMatchObject({ name: "Pipeline Q4" });
  });

  it("hides the shared view for one teammate only and shows it again on request", async () => {
    const hide = new HideSharedDataViewInteractor(views(), new PrismaP13nRepo());

    expect((await asSales(() => hide.invoke({ id: viewId, hidden: true }))).ok).toBe(true);
    expect(await visibleIds(asSales)).toEqual([]);
    expect((await asSales(() => views().loadSurfaceState(SURFACE))).activeViewKey).toBe(ALL_VIEW_KEY);
    expect(await visibleIds(asOwner)).toEqual([viewId]);
    expect((await asOwner(() => hide.invoke({ id: viewId, hidden: true }))).ok).toBe(false);

    expect((await asSales(() => hide.invoke({ id: viewId, hidden: false }))).ok).toBe(true);
    expect(await visibleIds(asSales)).toEqual([viewId]);
  });

  it("stops sharing when the owner makes the view private or moves it to Trash", async () => {
    expect((await asOwner(() => share().invoke({ id: viewId, visibility: "private", roleIds: [] }))).ok).toBe(true);
    expect(await visibleIds(asSales)).toEqual([]);
    const roleShares = await client.query('SELECT 1 FROM "DataViewRoleShare" WHERE "viewId" = $1', [viewId]);
    expect(roleShares.rowCount).toBe(0);

    await asOwner(() => share().invoke({ id: viewId, visibility: "workspace", roleIds: [] }));
    expect(await visibleIds(asSales)).toEqual([viewId]);
    expect(await asOwner(() => views().trashOwned(viewId))).toBe(true);
    expect(await visibleIds(asSales)).toEqual([]);
    expect(await asSales(() => views().findReadableOrNull(viewId))).toBeNull();
  });

  it("follows role changes, role deletion and removed members", async () => {
    const extraRoleId = randomUUID();
    const leaverId = randomUUID();
    await client.query(
      'INSERT INTO "UserRole" ("id", "name", "companyId", "updatedAt") VALUES ($1, $2, $3, CURRENT_TIMESTAMP)',
      [extraRoleId, "Partners", companyId],
    );
    await client.query(
      'INSERT INTO "User" ("id", "email", "firstName", "lastName", "companyId", "roleId", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)',
      [leaverId, `lea-${leaverId}@example.invalid`, "Lea", "Neumann", companyId, extraRoleId],
    );
    const sharedId = (
      await asOwner(() => views().createView({ surfaceKey: SURFACE, name: "Partners", position: 1, state: {} }))
    ).id;
    expect(
      (await asOwner(() => share().invoke({ id: sharedId, visibility: "roles", roleIds: [extraRoleId] }))).ok,
    ).toBe(true);

    const asLeaver = as(tenant(leaverId, companyId, extraRoleId, "Partners"));
    const asMovedSupport = as(tenant(supportId, companyId, extraRoleId, "Partners"));
    expect(await visibleIds(asLeaver)).toEqual([sharedId]);
    expect(await visibleIds(asSupport)).toEqual([]);
    expect(await visibleIds(asMovedSupport)).toEqual([sharedId]);

    const hide = new HideSharedDataViewInteractor(views(), new PrismaP13nRepo());
    expect((await asLeaver(() => hide.invoke({ id: sharedId, hidden: true }))).ok).toBe(true);
    await client.query('DELETE FROM "User" WHERE "id" = $1', [leaverId]);
    expect((await client.query('SELECT 1 FROM "DataViewHidden" WHERE "userId" = $1', [leaverId])).rowCount).toBe(0);

    await client.query('DELETE FROM "UserRole" WHERE "id" = $1', [extraRoleId]);
    expect((await client.query('SELECT 1 FROM "DataViewRoleShare" WHERE "viewId" = $1', [sharedId])).rowCount).toBe(0);
    expect(await visibleIds(asMovedSupport)).toEqual([]);
    expect(await visibleIds(asOwner)).toEqual([sharedId]);
  });

  it("never lets another workspace select, hide or reshare a shared view, even with a matching role id", async () => {
    const crossId = (
      await asOwner(() => views().createView({ surfaceKey: SURFACE, name: "Cross", position: 2, state: {} }))
    ).id;
    await asOwner(() => share().invoke({ id: crossId, visibility: "workspace", roleIds: [] }));
    const asForeignWithOurRole = as(tenant(outsiderId, otherCompanyId, salesRoleId, "Sales"));
    const select = new SelectDataViewInteractor(views(), new PrismaP13nRepo());
    const hide = new HideSharedDataViewInteractor(views(), new PrismaP13nRepo());

    for (const asForeign of [asOutsider, asForeignWithOurRole]) {
      expect(await visibleIds(asForeign)).toEqual([]);
      expect(await asForeign(() => views().findReadableOrNull(crossId))).toBeNull();
      expect(await asForeign(() => views().findSharedWithMeOrNull(crossId))).toBeNull();
      expect((await asForeign(() => select.invoke({ surfaceKey: SURFACE, viewKey: crossId }))).ok).toBe(false);
      expect((await asForeign(() => hide.invoke({ id: crossId, hidden: true }))).ok).toBe(false);
      expect((await asForeign(() => share().invoke({ id: crossId, visibility: "private", roleIds: [] }))).ok).toBe(
        false,
      );
      expect((await asForeign(() => views().listShareableRoles())).map(({ id }) => id)).toEqual([foreignRoleId]);
    }
    expect((await client.query('SELECT 1 FROM "DataViewHidden" WHERE "viewId" = $1', [crossId])).rowCount).toBe(0);
    expect(await visibleIds(asSupport)).toContain(crossId);
  });
});
