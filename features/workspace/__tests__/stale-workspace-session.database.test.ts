import { randomUUID } from "node:crypto";

import { serializeSignedCookie } from "better-call";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

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

describeDatabase("a browser session whose workspace was left on another device", { timeout: 120_000 }, () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const authUserId = randomUUID();
  const email = `stale-${randomUUID()}@example.invalid`;
  const companies = { kept: randomUUID(), left: randomUUID() };
  const members = { kept: randomUUID(), left: randomUUID(), leftAdmin: randomUUID() };
  const sessions = { stale: { id: randomUUID(), cookie: "" }, leaving: { id: randomUUID(), cookie: "" } };

  function as(session: { cookie: string }, kind: Record<string, string> = {}) {
    requestContext.headers = new Headers({ cookie: session.cookie, ...kind });
  }

  async function activeCompanyId(sessionId: string) {
    const result = await client.query<{ activeCompanyId: string | null }>(
      'SELECT "activeCompanyId" FROM "AuthSession" WHERE "id" = $1',
      [sessionId],
    );
    return result.rows[0]?.activeCompanyId ?? null;
  }

  beforeAll(async () => {
    await client.connect();
    const roles = { kept: randomUUID(), leftAdmin: randomUUID(), leftMember: randomUUID() };
    for (const [companyId, name] of [
      [companies.kept, "Kept"],
      [companies.left, "Left"],
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
    for (const [roleId, companyId, isSystemRole] of [
      [roles.kept, companies.kept, true],
      [roles.leftAdmin, companies.left, true],
      [roles.leftMember, companies.left, false],
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
    const { InitializeRecordModelService } = await import("@/features/records/initialize-record-model.service");
    const { createTestRecordRepo } = await import("@/tests/helpers/record-repository");
    const { createMockUser } = await import("@/tests/helpers/mock-user");
    for (const [companyId, userId, roleId] of [
      [companies.kept, members.kept, roles.kept],
      [companies.left, members.leftAdmin, roles.leftAdmin],
    ]) {
      const owner = createMockUser({ id: userId, companyId, roleId });
      await runWithTenant(owner, () => new InitializeRecordModelService(createTestRecordRepo()).initialize());
    }

    const { auth } = await import("@/core/auth/better-auth");
    const secret = (await auth.$context).secret;
    for (const session of Object.values(sessions)) {
      const token = randomUUID().replaceAll("-", "");
      await client.query(
        'INSERT INTO "AuthSession" ("id", "token", "userId", "expiresAt", "activeCompanyId", "updatedAt") VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)',
        [session.id, token, authUserId, new Date(Date.now() + 60 * 60 * 1000), companies.left],
      );
      session.cookie = (await serializeSignedCookie("app.session_token", token, secret)).split(";")[0];
    }
  });

  afterAll(async () => {
    await client.query('DELETE FROM "AuthUser" WHERE "id" = $1', [authUserId]);
    await client.query('DELETE FROM "Company" WHERE "id" = ANY($1)', [Object.values(companies)]);
    await client.end();
  });

  it("leaves the workspace on one device without moving the other device's session", async () => {
    const { getLeaveWorkspaceInteractor } = await import("@/core/di");
    as(sessions.leaving, SERVER_ACTION);

    expect(await getLeaveWorkspaceInteractor().invoke({ companyId: companies.left })).toEqual({
      ok: true,
      data: { companyId: companies.left },
    });

    expect(await activeCompanyId(sessions.stale.id)).toBe(companies.left);
  });

  it("refuses an action from the stale page instead of running it in another workspace", async () => {
    const { getGetUserDetailsInteractor } = await import("@/core/di");
    const { WorkspaceChangedError } = await import("@/core/errors/workspace-changed-error");
    as(sessions.stale, SERVER_ACTION);

    await expect(getGetUserDetailsInteractor().invoke()).rejects.toBeInstanceOf(WorkspaceChangedError);
    expect(await activeCompanyId(sessions.stale.id)).toBe(companies.left);
  });

  it("refuses a client-side navigation and a fetch of the stale page as well", async () => {
    const { getRouteGuardService } = await import("@/core/di");
    const { WorkspaceChangedError } = await import("@/core/errors/workspace-changed-error");
    as(sessions.stale, CLIENT_NAVIGATION);

    await expect(getRouteGuardService().resolveAccountState()).rejects.toBeInstanceOf(WorkspaceChangedError);

    as(sessions.stale, { "sec-fetch-mode": "cors", "sec-fetch-dest": "empty" });
    const response = await me();
    const body = (await response.json()) as { error: { kind: string; issues: Array<{ customCode?: string }> } };
    expect(response.status).toBe(409);
    expect(body.error).toMatchObject({ kind: "conflict", issues: [{ customCode: "workspaceChanged" }] });
    expect(await activeCompanyId(sessions.stale.id)).toBe(companies.left);
  });

  it("opens the kept workspace on the next full page load, after which actions run there", async () => {
    const { getGetUserDetailsInteractor, getRouteGuardService } = await import("@/core/di");
    as(sessions.stale, PAGE_LOAD);

    const resolution = await getRouteGuardService().resolveAccountState();

    expect(resolution.user?.id).toBe(members.kept);
    expect(await activeCompanyId(sessions.stale.id)).toBe(companies.kept);

    as(sessions.stale, SERVER_ACTION);
    await expect(getGetUserDetailsInteractor().invoke()).resolves.toMatchObject({
      ok: true,
      data: { id: members.kept },
    });
  });

  it("still opens the last used workspace for a new session whose first request is an action", async () => {
    const { getGetUserDetailsInteractor } = await import("@/core/di");
    await client.query('UPDATE "AuthSession" SET "activeCompanyId" = NULL WHERE "id" = $1', [sessions.leaving.id]);
    as(sessions.leaving, SERVER_ACTION);

    await expect(getGetUserDetailsInteractor().invoke()).resolves.toMatchObject({
      ok: true,
      data: { id: members.kept },
    });
    expect(await activeCompanyId(sessions.leaving.id)).toBe(companies.kept);
  });
});

describeDatabase("a browser session whose only workspace ended", { timeout: 120_000 }, () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const authUserId = randomUUID();
  const email = `solo-${randomUUID()}@example.invalid`;
  const companyId = randomUUID();
  const members = { solo: randomUUID(), admin: randomUUID() };
  const sessions = { stale: { id: randomUUID(), cookie: "" }, leaving: { id: randomUUID(), cookie: "" } };

  function as(session: { cookie: string }, kind: Record<string, string> = {}) {
    requestContext.headers = new Headers({ cookie: session.cookie, ...kind });
  }

  async function activeCompanyId(sessionId: string) {
    const result = await client.query<{ activeCompanyId: string | null }>(
      'SELECT "activeCompanyId" FROM "AuthSession" WHERE "id" = $1',
      [sessionId],
    );
    return result.rows[0]?.activeCompanyId ?? null;
  }

  beforeAll(async () => {
    await client.connect();
    const roles = { admin: randomUUID(), member: randomUUID() };
    await client.query('INSERT INTO "Company" ("id", "name", "updatedAt") VALUES ($1, \'Solo\', CURRENT_TIMESTAMP)', [
      companyId,
    ]);
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
    const { InitializeRecordModelService } = await import("@/features/records/initialize-record-model.service");
    const { createTestRecordRepo } = await import("@/tests/helpers/record-repository");
    const { createMockUser } = await import("@/tests/helpers/mock-user");
    const owner = createMockUser({ id: members.admin, companyId, roleId: roles.admin });
    await runWithTenant(owner, () => new InitializeRecordModelService(createTestRecordRepo()).initialize());

    const { auth } = await import("@/core/auth/better-auth");
    const secret = (await auth.$context).secret;
    for (const session of Object.values(sessions)) {
      const token = randomUUID().replaceAll("-", "");
      await client.query(
        'INSERT INTO "AuthSession" ("id", "token", "userId", "expiresAt", "activeCompanyId", "updatedAt") VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)',
        [session.id, token, authUserId, new Date(Date.now() + 60 * 60 * 1000), companyId],
      );
      session.cookie = (await serializeSignedCookie("app.session_token", token, secret)).split(";")[0];
    }

    const { getLeaveWorkspaceInteractor } = await import("@/core/di");
    as(sessions.leaving, SERVER_ACTION);
    expect(await getLeaveWorkspaceInteractor().invoke({ companyId })).toEqual({ ok: true, data: { companyId } });
  });

  afterAll(async () => {
    await client.query('DELETE FROM "Company" WHERE "id" = $1 OR "createdByAuthUserId" = $2', [companyId, authUserId]);
    await client.query('DELETE FROM "AuthUser" WHERE "id" = $1', [authUserId]);
    await client.end();
  });

  it("still refuses the stale page's actions, so that tab reloads first", async () => {
    const { getGetUserDetailsInteractor } = await import("@/core/di");
    const { WorkspaceChangedError } = await import("@/core/errors/workspace-changed-error");
    as(sessions.stale, SERVER_ACTION);

    await expect(getGetUserDetailsInteractor().invoke()).rejects.toBeInstanceOf(WorkspaceChangedError);
    expect(await activeCompanyId(sessions.stale.id)).toBe(companyId);
  });

  it("clears the session's workspace on the next page load and opens onboarding", async () => {
    const { getRouteGuardService } = await import("@/core/di");
    as(sessions.stale, PAGE_LOAD);

    const resolution = await getRouteGuardService().resolveAccountState();

    expect(resolution).toMatchObject({ state: "unregistered", user: null });
    expect(await activeCompanyId(sessions.stale.id)).toBeNull();
  });

  it("lets onboarding ask to join the old workspace again without signing out", async () => {
    const { getRegisterUserInteractor } = await import("@/core/di");
    as(sessions.stale, SERVER_ACTION);

    const registered = await getRegisterUserInteractor().invoke(
      { email, firstName: "Only", lastName: "Workspace", country: "de", avatarUrl: null, agreeToTerms: true },
      { target: { type: "invitation", companyId } },
    );

    expect(registered).toEqual({ ok: true, data: { redirectTo: "/auth/pending" } });
    const membership = await client.query<{ status: string; leftAt: Date | null }>(
      'SELECT "status"::text AS status, "leftAt" FROM "User" WHERE "id" = $1',
      [members.solo],
    );
    expect(membership.rows).toEqual([{ status: "pendingAuthorization", leftAt: null }]);
  });

  it("lets the same session create a new workspace and work in it", async () => {
    const { getCreateWorkspaceInteractor, getGetUserDetailsInteractor } = await import("@/core/di");
    as(sessions.stale, SERVER_ACTION);

    const created = await getCreateWorkspaceInteractor().invoke({ name: "Fresh Start", agreeToTerms: true });

    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(await activeCompanyId(sessions.stale.id)).toBe(created.data.companyId);
    await expect(getGetUserDetailsInteractor().invoke()).resolves.toMatchObject({
      ok: true,
      data: { email },
    });
  });
});
