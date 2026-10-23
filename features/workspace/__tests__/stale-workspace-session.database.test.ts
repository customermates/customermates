import { randomUUID } from "node:crypto";

import { serializeSignedCookie } from "better-call";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { WORKSPACE_HEADER } from "@/core/navigation/workspace-paths";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

const requestContext = vi.hoisted(() => ({ headers: new Headers() }));

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(requestContext.headers),
  cookies: () =>
    Promise.resolve({ get: () => undefined, getAll: () => [], set: () => undefined, delete: () => undefined }),
}));
vi.mock("next-intl/server", () => ({
  getLocale: () => Promise.resolve("en"),
  getTranslations: () => {
    const translate = (key: string) => key;
    return Promise.resolve(Object.assign(translate, { raw: translate }));
  },
}));

import { GET as me } from "@/app/api/v1/users/me/route";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

const SERVER_ACTION = { "next-action": "7f00c0ffee", "sec-fetch-mode": "cors", "sec-fetch-dest": "empty" };
const CLIENT_NAVIGATION = { rsc: "1", "sec-fetch-mode": "cors", "sec-fetch-dest": "empty" };
const PAGE_LOAD = { "sec-fetch-mode": "navigate", "sec-fetch-dest": "document" };

describeDatabase("browser tabs of a workspace that was left on another device", { timeout: 120_000 }, () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const authUserId = randomUUID();
  const email = `stale-${randomUUID()}@example.invalid`;
  const companies = { kept: randomUUID(), left: randomUUID(), foreign: randomUUID() };
  const members = { kept: randomUUID(), left: randomUUID(), leftAdmin: randomUUID(), foreignAdmin: randomUUID() };
  const sessions = { stale: { id: randomUUID(), cookie: "" }, leaving: { id: randomUUID(), cookie: "" } };
  const slugs = { kept: "", left: "", foreign: "" };

  function as(session: { cookie: string }, kind: Record<string, string> = {}, workspaceSlug?: string) {
    requestContext.headers = new Headers({
      cookie: session.cookie,
      ...kind,
      ...(workspaceSlug ? { [WORKSPACE_HEADER]: workspaceSlug } : {}),
    });
  }

  async function lastUsedCompanyId() {
    const result = await client.query<{ companyId: string | null }>(
      'SELECT "companyId" FROM "AuthUser" WHERE "id" = $1',
      [authUserId],
    );
    return result.rows[0]?.companyId ?? null;
  }

  beforeAll(async () => {
    await client.connect();
    const roles = { kept: randomUUID(), leftAdmin: randomUUID(), leftMember: randomUUID(), foreignAdmin: randomUUID() };
    for (const [companyId, name] of [
      [companies.kept, "Kept"],
      [companies.left, "Left"],
      [companies.foreign, "Foreign"],
    ]) {
      await client.query('INSERT INTO "Company" ("id", "name", "updatedAt") VALUES ($1, $2, CURRENT_TIMESTAMP)', [
        companyId,
        name,
      ]);
      await client.query(
        'INSERT INTO "Subscription" ("id", "companyId", "status", "updatedAt") VALUES ($1, $2, \'active\', CURRENT_TIMESTAMP)',
        [randomUUID(), companyId],
      );
    }
    const stored = await client.query<{ id: string; slug: string }>(
      'SELECT "id", "slug" FROM "Company" WHERE "id" = ANY($1)',
      [Object.values(companies)],
    );
    for (const [key, companyId] of Object.entries(companies) as Array<[keyof typeof companies, string]>)
      slugs[key] = stored.rows.find((row) => row.id === companyId)?.slug ?? "";
    for (const [roleId, companyId, isSystemRole] of [
      [roles.kept, companies.kept, true],
      [roles.leftAdmin, companies.left, true],
      [roles.leftMember, companies.left, false],
      [roles.foreignAdmin, companies.foreign, true],
    ] as const) {
      await client.query(
        'INSERT INTO "UserRole" ("id", "name", "isSystemRole", "companyId", "updatedAt") VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)',
        [roleId, isSystemRole ? "Admin" : "Member", isSystemRole, companyId],
      );
    }
    for (const [userId, userEmail, companyId, roleId] of [
      [members.kept, email, companies.kept, roles.kept],
      [members.left, email, companies.left, roles.leftMember],
      [members.leftAdmin, `admin-${email}`, companies.left, roles.leftAdmin],
      [members.foreignAdmin, `foreign-${email}`, companies.foreign, roles.foreignAdmin],
    ]) {
      await client.query(
        'INSERT INTO "User" ("id", "email", "firstName", "lastName", "companyId", "roleId", "status", "lastActiveAt", "onboardingWizardCompletedAt", "updatedAt") VALUES ($1, $2, \'Two\', \'Devices\', $3, $4, \'active\', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
        [userId, userEmail, companyId, roleId],
      );
    }
    await client.query(
      'INSERT INTO "AuthUser" ("id", "name", "email", "emailVerified", "companyId", "updatedAt") VALUES ($1, \'Two Devices\', $2, TRUE, $3, CURRENT_TIMESTAMP)',
      [authUserId, email, companies.left],
    );

    const { runWithTenant } = await import("@/core/decorators/tenant-context");
    const { initializeStarterRecordModel } = await import("@/tests/helpers/record-repository");
    const { createMockUser } = await import("@/tests/helpers/mock-user");
    for (const [companyId, userId, roleId] of [
      [companies.kept, members.kept, roles.kept],
      [companies.left, members.leftAdmin, roles.leftAdmin],
    ]) {
      const owner = createMockUser({ id: userId, companyId, roleId });
      await runWithTenant(owner, () => initializeStarterRecordModel());
    }

    const { auth } = await import("@/core/auth/better-auth");
    const secret = (await auth.$context).secret;
    for (const session of Object.values(sessions)) {
      const token = randomUUID().replaceAll("-", "");
      await client.query(
        'INSERT INTO "AuthSession" ("id", "token", "userId", "expiresAt", "updatedAt") VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)',
        [session.id, token, authUserId, new Date(Date.now() + 60 * 60 * 1000)],
      );
      session.cookie = (await serializeSignedCookie("app.session_token", token, secret)).split(";")[0];
    }
  });

  afterAll(async () => {
    await client.query('DELETE FROM "AuthUser" WHERE "id" = $1', [authUserId]);
    await client.query('DELETE FROM "Company" WHERE "id" = ANY($1)', [Object.values(companies)]);
    await client.end();
  });

  it("gives every workspace its own slug", () => {
    expect(new Set(Object.values(slugs)).size).toBe(3);
    for (const slug of Object.values(slugs)) expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it("runs each tab in the workspace its URL names while the login is a member of both", async () => {
    const { getGetUserDetailsInteractor } = await import("@/core/di");

    as(sessions.stale, SERVER_ACTION, slugs.kept);
    await expect(getGetUserDetailsInteractor().invoke()).resolves.toMatchObject({
      ok: true,
      data: { id: members.kept },
    });
    as(sessions.stale, SERVER_ACTION, slugs.left);
    await expect(getGetUserDetailsInteractor().invoke()).resolves.toMatchObject({
      ok: true,
      data: { id: members.left },
    });
    expect(await lastUsedCompanyId()).toBe(companies.left);
  });

  it("leaves the workspace on one device and moves the login's last used workspace to the one it kept", async () => {
    const { getLeaveWorkspaceInteractor } = await import("@/core/di");
    as(sessions.leaving, SERVER_ACTION, slugs.left);

    expect(await getLeaveWorkspaceInteractor().invoke({ companyId: companies.left })).toEqual({
      ok: true,
      data: { companyId: companies.left },
    });

    expect(await lastUsedCompanyId()).toBe(companies.kept);
  });

  it("refuses an action from the left workspace's open tab instead of running it in another workspace", async () => {
    const { getGetUserDetailsInteractor } = await import("@/core/di");
    const { WorkspaceChangedError } = await import("@/core/errors/workspace-changed-error");
    as(sessions.stale, SERVER_ACTION, slugs.left);

    await expect(getGetUserDetailsInteractor().invoke()).rejects.toBeInstanceOf(WorkspaceChangedError);
    expect(await lastUsedCompanyId()).toBe(companies.kept);
  });

  it("refuses a client-side navigation, a fetch and a full page load of the left workspace as well", async () => {
    const { getRouteGuardService } = await import("@/core/di");
    const { WorkspaceChangedError } = await import("@/core/errors/workspace-changed-error");

    as(sessions.stale, CLIENT_NAVIGATION, slugs.left);
    await expect(getRouteGuardService().resolveAccountState()).rejects.toBeInstanceOf(WorkspaceChangedError);

    as(sessions.stale, { "sec-fetch-mode": "cors", "sec-fetch-dest": "empty" }, slugs.left);
    const response = await me();
    const body = (await response.json()) as { error: { kind: string; issues: Array<{ customCode?: string }> } };
    expect(response.status).toBe(409);
    expect(body.error).toMatchObject({ kind: "conflict", issues: [{ customCode: "workspaceChanged" }] });

    as(sessions.stale, PAGE_LOAD, slugs.left);
    await expect(getRouteGuardService().resolveAccountState()).rejects.toBeInstanceOf(WorkspaceChangedError);
  });

  it("refuses the slug of a workspace the login never belonged to", async () => {
    const { getGetUserDetailsInteractor, getRouteGuardService } = await import("@/core/di");
    const { WorkspaceChangedError } = await import("@/core/errors/workspace-changed-error");

    as(sessions.stale, PAGE_LOAD, slugs.foreign);
    await expect(getRouteGuardService().resolveAccountState()).rejects.toBeInstanceOf(WorkspaceChangedError);
    as(sessions.stale, SERVER_ACTION, slugs.foreign);
    await expect(getGetUserDetailsInteractor().invoke()).rejects.toBeInstanceOf(WorkspaceChangedError);
    expect(await lastUsedCompanyId()).toBe(companies.kept);
  });

  it("keeps a tab of the kept workspace working on the same session", async () => {
    const { getGetUserDetailsInteractor, getRouteGuardService } = await import("@/core/di");

    as(sessions.stale, PAGE_LOAD, slugs.kept);
    expect((await getRouteGuardService().resolveAccountState()).user?.id).toBe(members.kept);

    as(sessions.stale, SERVER_ACTION, slugs.kept);
    await expect(getGetUserDetailsInteractor().invoke()).resolves.toMatchObject({
      ok: true,
      data: { id: members.kept },
    });
  });

  it("opens the last used workspace for a request without a workspace in its URL, never the left one", async () => {
    const { getGetUserDetailsInteractor, getRouteGuardService } = await import("@/core/di");

    as(sessions.leaving, PAGE_LOAD);
    expect((await getRouteGuardService().resolveAccountState()).user?.id).toBe(members.kept);

    await client.query('UPDATE "AuthUser" SET "companyId" = $2 WHERE "id" = $1', [authUserId, companies.left]);
    as(sessions.leaving, SERVER_ACTION);
    await expect(getGetUserDetailsInteractor().invoke()).resolves.toMatchObject({
      ok: true,
      data: { id: members.kept },
    });
  });
});

describeDatabase("a browser tab whose only workspace ended", { timeout: 120_000 }, () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const authUserId = randomUUID();
  const email = `solo-${randomUUID()}@example.invalid`;
  const companyId = randomUUID();
  const members = { solo: randomUUID(), admin: randomUUID() };
  const sessions = { stale: { id: randomUUID(), cookie: "" }, leaving: { id: randomUUID(), cookie: "" } };
  let slug = "";

  function as(session: { cookie: string }, kind: Record<string, string> = {}, workspaceSlug?: string) {
    requestContext.headers = new Headers({
      cookie: session.cookie,
      ...kind,
      ...(workspaceSlug ? { [WORKSPACE_HEADER]: workspaceSlug } : {}),
    });
  }

  async function lastUsedCompanyId() {
    const result = await client.query<{ companyId: string | null }>(
      'SELECT "companyId" FROM "AuthUser" WHERE "id" = $1',
      [authUserId],
    );
    return result.rows[0]?.companyId ?? null;
  }

  beforeAll(async () => {
    await client.connect();
    const roles = { admin: randomUUID(), member: randomUUID() };
    const company = await client.query<{ slug: string }>(
      'INSERT INTO "Company" ("id", "name", "updatedAt") VALUES ($1, \'Solo\', CURRENT_TIMESTAMP) RETURNING "slug"',
      [companyId],
    );
    slug = company.rows[0].slug;
    await client.query(
      'INSERT INTO "Subscription" ("id", "companyId", "status", "updatedAt") VALUES ($1, $2, \'active\', CURRENT_TIMESTAMP)',
      [randomUUID(), companyId],
    );
    for (const [roleId, isSystemRole] of [
      [roles.admin, true],
      [roles.member, false],
    ] as const) {
      await client.query(
        'INSERT INTO "UserRole" ("id", "name", "isSystemRole", "companyId", "updatedAt") VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)',
        [roleId, isSystemRole ? "Admin" : "Member", isSystemRole, companyId],
      );
    }
    for (const [userId, userEmail, roleId] of [
      [members.solo, email, roles.member],
      [members.admin, `admin-${email}`, roles.admin],
    ]) {
      await client.query(
        'INSERT INTO "User" ("id", "email", "firstName", "lastName", "companyId", "roleId", "status", "lastActiveAt", "onboardingWizardCompletedAt", "updatedAt") VALUES ($1, $2, \'Only\', \'Workspace\', $3, $4, \'active\', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
        [userId, userEmail, companyId, roleId],
      );
    }
    await client.query(
      'INSERT INTO "AuthUser" ("id", "name", "email", "emailVerified", "companyId", "updatedAt") VALUES ($1, \'Only Workspace\', $2, TRUE, $3, CURRENT_TIMESTAMP)',
      [authUserId, email, companyId],
    );

    const { runWithTenant } = await import("@/core/decorators/tenant-context");
    const { initializeStarterRecordModel } = await import("@/tests/helpers/record-repository");
    const { createMockUser } = await import("@/tests/helpers/mock-user");
    const owner = createMockUser({ id: members.admin, companyId, roleId: roles.admin });
    await runWithTenant(owner, () => initializeStarterRecordModel());

    const { auth } = await import("@/core/auth/better-auth");
    const secret = (await auth.$context).secret;
    for (const session of Object.values(sessions)) {
      const token = randomUUID().replaceAll("-", "");
      await client.query(
        'INSERT INTO "AuthSession" ("id", "token", "userId", "expiresAt", "updatedAt") VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)',
        [session.id, token, authUserId, new Date(Date.now() + 60 * 60 * 1000)],
      );
      session.cookie = (await serializeSignedCookie("app.session_token", token, secret)).split(";")[0];
    }

    const { getLeaveWorkspaceInteractor } = await import("@/core/di");
    as(sessions.leaving, SERVER_ACTION, slug);
    expect(await getLeaveWorkspaceInteractor().invoke({ companyId })).toEqual({ ok: true, data: { companyId } });
  });

  afterAll(async () => {
    await client.query('DELETE FROM "Company" WHERE "id" = $1 OR "createdByAuthUserId" = $2', [companyId, authUserId]);
    await client.query('DELETE FROM "AuthUser" WHERE "id" = $1', [authUserId]);
    await client.end();
  });

  it("refuses the open tab's actions and page loads after the membership ended", async () => {
    const { getGetUserDetailsInteractor, getRouteGuardService } = await import("@/core/di");
    const { WorkspaceChangedError } = await import("@/core/errors/workspace-changed-error");

    as(sessions.stale, SERVER_ACTION, slug);
    await expect(getGetUserDetailsInteractor().invoke()).rejects.toBeInstanceOf(WorkspaceChangedError);
    as(sessions.stale, PAGE_LOAD, slug);
    await expect(getRouteGuardService().resolveAccountState()).rejects.toBeInstanceOf(WorkspaceChangedError);
  });

  it("clears the login's last used workspace and opens onboarding from a generic entry point", async () => {
    const { getRouteGuardService } = await import("@/core/di");
    as(sessions.stale, PAGE_LOAD);

    const resolution = await getRouteGuardService().resolveAccountState();

    expect(resolution).toMatchObject({ state: "unregistered", user: null });
    expect(await lastUsedCompanyId()).toBeNull();
  });

  it("lets onboarding ask to join the old workspace again without signing out", async () => {
    const { getRegisterUserInteractor } = await import("@/core/di");
    as(sessions.stale, SERVER_ACTION);

    const registered = await getRegisterUserInteractor().invoke(
      { email, firstName: "Only", lastName: "Workspace", avatarUrl: null, agreeToTerms: true },
      { target: { type: "invitation", companyId } },
    );

    expect(registered).toEqual({ ok: true, data: { redirectTo: "/auth/pending" } });
    const membership = await client.query<{ status: string; leftAt: Date | null }>(
      'SELECT "status"::text AS status, "leftAt" FROM "User" WHERE "id" = $1',
      [members.solo],
    );
    expect(membership.rows).toEqual([{ status: "pendingAuthorization", leftAt: null }]);
  });

  it("lets the same session create a new workspace and work in it by its slug", async () => {
    const { getCreateWorkspaceInteractor, getGetUserDetailsInteractor } = await import("@/core/di");
    as(sessions.stale, SERVER_ACTION);

    const created = await getCreateWorkspaceInteractor().invoke({ name: "Fresh Start", agreeToTerms: true });

    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(await lastUsedCompanyId()).toBe(created.data.companyId);
    expect(created.data.slug).toMatch(/^fresh-start(-[a-z0-9]+)?$/);
    as(sessions.stale, SERVER_ACTION, created.data.slug ?? "");
    const details = await getGetUserDetailsInteractor().invoke();
    expect(details).toMatchObject({ ok: true, data: { email } });
    if (!details.ok) return;
    const owner = await client.query<{ companyId: string }>('SELECT "companyId" FROM "User" WHERE "id" = $1', [
      details.data.id,
    ]);
    expect(owner.rows[0]?.companyId).toBe(created.data.companyId);
  });
});
