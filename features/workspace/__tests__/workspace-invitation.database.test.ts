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

type Fixture = {
  email: string;
  adminEmail: string;
  authUserId: string;
  sessionId: string;
  cookie: string;
  clientId: string;
  companies: { own: string; invited: string };
  members: { own: string; invitedAdmin: string };
  roles: { invitedMember: string };
  intent: string;
};

describeDatabase("joining another workspace by invitation with an existing login", { timeout: 120_000 }, () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  let fixture: Fixture;
  let joinedMemberId = "";

  function asSession() {
    requestContext.headers = new Headers({ cookie: fixture.cookie });
  }

  async function whoAmI() {
    asSession();
    const response = await me();
    const body = (await response.json()) as { id?: string };
    return { status: response.status, userId: response.status === 200 ? (body.id ?? null) : null };
  }

  async function membership(companyId: string) {
    const result = await client.query<{
      id: string;
      status: string;
      roleId: string | null;
      leftAt: Date | null;
      firstName: string;
    }>('SELECT "id", "status", "roleId", "leftAt", "firstName" FROM "User" WHERE "companyId" = $1 AND "email" = $2', [
      companyId,
      fixture.email,
    ]);
    return result.rows[0] ?? null;
  }

  async function login() {
    const session = await client.query<{ activeCompanyId: string | null }>(
      'SELECT "activeCompanyId" FROM "AuthSession" WHERE "id" = $1',
      [fixture.sessionId],
    );
    const authUser = await client.query<{ companyId: string | null }>(
      'SELECT "companyId" FROM "AuthUser" WHERE "id" = $1',
      [fixture.authUserId],
    );
    return { activeCompanyId: session.rows[0]?.activeCompanyId, lastUsedCompanyId: authUser.rows[0]?.companyId };
  }

  async function pendingConsent() {
    const code = randomUUID();
    await client.query(
      'INSERT INTO "AuthVerification" ("id", "identifier", "value", "expiresAt", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
      [
        randomUUID(),
        code,
        JSON.stringify({
          clientId: fixture.clientId,
          redirectURI: "https://client.example.test/callback",
          scope: ["openid"],
          userId: fixture.authUserId,
          authTime: Date.now(),
          requireConsent: true,
          state: "state-1",
          codeChallenge: "challenge",
          codeChallengeMethod: "s256",
        }),
        new Date(Date.now() + 10 * 60 * 1000),
      ],
    );
    return code;
  }

  async function approveAsInvitedAdmin(change: { status: "active" | "inactive"; roleId?: string }) {
    const { PermissionService } = await import("@/core/base/permission.service");
    const { PrismaUserRepo } = await import("@/features/user/prisma-user.repository");
    const { runWithTenant } = await import("@/core/decorators/tenant-context");
    const { getAdminUpdateUserDetailsInteractor } = await import("@/core/di");
    const admin = await new PrismaUserRepo(new PermissionService()).findMembershipUnscoped(
      fixture.adminEmail,
      fixture.companies.invited,
    );
    if (!admin) throw new Error("The invited workspace admin is missing.");

    return runWithTenant(admin, () =>
      getAdminUpdateUserDetailsInteractor().invoke({ userId: joinedMemberId, ...change }),
    );
  }

  beforeAll(async () => {
    await client.connect();
    const email = `join-${randomUUID()}@example.invalid`;
    const adminEmail = `invited-admin-${randomUUID()}@example.invalid`;
    const companies = { own: randomUUID(), invited: randomUUID() };
    const roles = { own: randomUUID(), invitedAdmin: randomUUID(), invitedMember: randomUUID() };
    const members = { own: randomUUID(), invitedAdmin: randomUUID() };
    const authUserId = randomUUID();

    for (const [companyId, name] of [
      [companies.own, "Own CRM"],
      [companies.invited, "Bergmann Steuern"],
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
    for (const [roleId, companyId, name, isSystemRole] of [
      [roles.own, companies.own, "Admin", true],
      [roles.invitedAdmin, companies.invited, "Admin", true],
      [roles.invitedMember, companies.invited, "Member", false],
    ] as const) {
      await client.query(
        'INSERT INTO "UserRole" ("id", "name", "isSystemRole", "companyId", "updatedAt") VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)',
        [roleId, name, isSystemRole, companyId],
      );
    }
    for (const [userId, userEmail, companyId, roleId] of [
      [members.own, email, companies.own, roles.own],
      [members.invitedAdmin, adminEmail, companies.invited, roles.invitedAdmin],
    ]) {
      await client.query(
        'INSERT INTO "User" ("id", "email", "firstName", "lastName", "companyId", "roleId", "status", "lastActiveAt", "onboardingWizardCompletedAt", "updatedAt") VALUES ($1, $2, \'Ben\', \'Joiner\', $3, $4, \'active\', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
        [userId, userEmail, companyId, roleId],
      );
    }
    await client.query(
      'INSERT INTO "AuthUser" ("id", "name", "email", "emailVerified", "companyId", "updatedAt") VALUES ($1, \'Ben Joiner\', $2, TRUE, $3, CURRENT_TIMESTAMP)',
      [authUserId, email, companies.own],
    );

    const { runWithTenant } = await import("@/core/decorators/tenant-context");
    const { InitializeRecordModelService } = await import("@/features/records/initialize-record-model.service");
    const { createTestRecordRepo } = await import("@/tests/helpers/record-repository");
    const { createMockUser } = await import("@/tests/helpers/mock-user");
    for (const [companyId, userId, roleId] of [
      [companies.own, members.own, roles.own],
      [companies.invited, members.invitedAdmin, roles.invitedAdmin],
    ]) {
      const owner = createMockUser({ id: userId, companyId, roleId });
      await runWithTenant(owner, () => new InitializeRecordModelService(createTestRecordRepo()).initialize());
    }

    const inviteToken = randomUUID().replaceAll("-", "");
    const inviteExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await client.query(
      'INSERT INTO "InviteToken" ("id", "token", "companyId", "createdById", "expiresAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)',
      [randomUUID(), inviteToken, companies.invited, members.invitedAdmin, inviteExpiresAt],
    );

    const sessionId = randomUUID();
    const token = randomUUID().replaceAll("-", "");
    await client.query(
      'INSERT INTO "AuthSession" ("id", "token", "userId", "expiresAt", "updatedAt") VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)',
      [sessionId, token, authUserId, new Date(Date.now() + 60 * 60 * 1000)],
    );
    const { auth } = await import("@/core/auth/better-auth");
    const secret = (await auth.$context).secret;
    const cookie = (await serializeSignedCookie("app.session_token", token, secret)).split(";")[0];

    const clientId = `client-${randomUUID()}`;
    await client.query(
      'INSERT INTO "OauthApplication" ("id", "name", "clientId", "redirectUrls", "type", "createdAt", "updatedAt") VALUES ($1, \'Join\', $2, \'https://client.example.test/callback\', \'public\', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
      [randomUUID(), clientId],
    );

    const { getOnboardingIntentService } = await import("@/core/di");
    const intent = getOnboardingIntentService().issueInvitation(inviteToken, inviteExpiresAt);
    if (!intent) throw new Error("The invitation intent could not be issued.");

    fixture = {
      email,
      adminEmail,
      authUserId,
      sessionId,
      cookie,
      clientId,
      companies,
      members,
      roles: { invitedMember: roles.invitedMember },
      intent,
    };
  });

  afterAll(async () => {
    if (fixture) {
      await client.query('DELETE FROM "AuthVerification" WHERE "value" LIKE $1', [`%${fixture.authUserId}%`]);
      await client.query('DELETE FROM "AuthVerification" WHERE "value" = ANY($1)', [
        [fixture.companies.own, fixture.companies.invited],
      ]);
      await client.query('DELETE FROM "OauthConsent" WHERE "userId" = $1', [fixture.authUserId]);
      await client.query('DELETE FROM "OauthApplication" WHERE "clientId" = $1', [fixture.clientId]);
      await client.query('DELETE FROM "AuthUser" WHERE "id" = $1', [fixture.authUserId]);
      await client.query('DELETE FROM "InviteToken" WHERE "companyId" = $1', [fixture.companies.invited]);
      await client.query('DELETE FROM "Company" WHERE "id" = ANY($1)', [
        [fixture.companies.own, fixture.companies.invited],
      ]);
    }
    await client.end();
  });

  it("joins the invited workspace as a pending member next to the existing one and switches to it", async () => {
    const { getJoinWorkspaceInteractor, getRouteGuardService } = await import("@/core/di");
    asSession();

    const joined = await getJoinWorkspaceInteractor().invoke({ intent: fixture.intent });

    expect(joined).toEqual({
      ok: true,
      data: { companyId: fixture.companies.invited, status: "pendingAuthorization", alreadyMember: false },
    });
    const pending = await membership(fixture.companies.invited);
    expect(pending).toMatchObject({ status: "pendingAuthorization", roleId: null, leftAt: null, firstName: "Ben" });
    joinedMemberId = pending?.id ?? "";
    expect(await membership(fixture.companies.own)).toMatchObject({ id: fixture.members.own, status: "active" });
    expect(await login()).toEqual({
      activeCompanyId: fixture.companies.invited,
      lastUsedCompanyId: fixture.companies.invited,
    });

    asSession();
    expect((await getRouteGuardService().resolveAccountState()).state).toBe("pending");
  });

  it("shows the plan and member count only of the workspace the login is an active member of", async () => {
    const { getListMyWorkspacesInteractor } = await import("@/core/di");
    asSession();

    const { data } = await getListMyWorkspacesInteractor().invoke();

    expect(data.find((workspace) => workspace.companyId === fixture.companies.invited)).toMatchObject({
      status: "pendingAuthorization",
      name: "Bergmann Steuern",
      activeMemberCount: null,
      subscription: null,
    });
    expect(data.find((workspace) => workspace.companyId === fixture.companies.own)).toMatchObject({
      status: "active",
      activeMemberCount: 1,
      subscription: { status: "active" },
    });
  });

  it("lets the pending member connect an MCP client to another of their workspaces only", async () => {
    const { getDecideMcpConsentInteractor, getListMcpConsentWorkspacesInteractor } = await import("@/core/di");
    asSession();

    const listed = await getListMcpConsentWorkspacesInteractor().invoke();
    expect(
      listed.data.map(({ companyId, isCurrent, unavailableReason }) => [companyId, isCurrent, unavailableReason]),
    ).toEqual(
      expect.arrayContaining([
        [fixture.companies.own, false, null],
        [fixture.companies.invited, true, "pending"],
      ]),
    );

    const restrictedCode = await pendingConsent();
    asSession();
    await expect(
      getDecideMcpConsentInteractor().invoke({
        consentCode: restrictedCode,
        accept: true,
        companyId: fixture.companies.invited,
      }),
    ).resolves.toEqual({ ok: true, data: null });

    const consentCode = await pendingConsent();
    asSession();
    const decided = await getDecideMcpConsentInteractor().invoke({
      consentCode,
      accept: true,
      companyId: fixture.companies.own,
    });
    if (!decided.ok || !decided.data) throw new Error("The consent was not decided.");
    const authorizationCode = new URL(decided.data.redirectURI).searchParams.get("code");
    expect(authorizationCode).toBeTruthy();
    const binding = await client.query<{ value: string }>(
      'SELECT "value" FROM "AuthVerification" WHERE "identifier" = $1',
      [`mcp-code-workspace:${authorizationCode}`],
    );
    expect(binding.rows[0]?.value).toBe(fixture.companies.own);
  });

  it("opens the invited workspace after an admin approves the member", async () => {
    const { getJoinWorkspaceInteractor, getListMcpConsentWorkspacesInteractor, getSwitchWorkspaceInteractor } =
      await import("@/core/di");

    expect(await approveAsInvitedAdmin({ status: "active", roleId: fixture.roles.invitedMember })).toMatchObject({
      ok: true,
    });
    asSession();
    await getSwitchWorkspaceInteractor().invoke({ companyId: fixture.companies.own });
    expect(await whoAmI()).toEqual({ status: 200, userId: fixture.members.own });

    asSession();
    expect(await getJoinWorkspaceInteractor().invoke({ intent: fixture.intent })).toEqual({
      ok: true,
      data: { companyId: fixture.companies.invited, status: "active", alreadyMember: true },
    });
    expect(await whoAmI()).toEqual({ status: 200, userId: joinedMemberId });

    asSession();
    const listed = await getListMcpConsentWorkspacesInteractor().invoke();
    expect(listed.data.find((workspace) => workspace.companyId === fixture.companies.invited)).toMatchObject({
      isCurrent: true,
      unavailableReason: "permission",
    });
  });

  it("keeps a member who left out until a new invitation revives the membership as pending", async () => {
    const { getJoinWorkspaceInteractor, getLeaveWorkspaceInteractor } = await import("@/core/di");
    const { CustomErrorCode } = await import("@/core/validation/validation.types");
    const { interactorFailureCodes } = await import("@/core/validation/validation.utils");
    asSession();

    expect(await getLeaveWorkspaceInteractor().invoke()).toEqual({
      ok: true,
      data: { companyId: fixture.companies.invited },
    });
    expect(await membership(fixture.companies.invited)).toMatchObject({ status: "inactive", leftAt: expect.any(Date) });
    expect(await whoAmI()).toEqual({ status: 200, userId: fixture.members.own });

    const reactivation = await approveAsInvitedAdmin({ status: "active" });
    expect(reactivation.ok).toBe(false);
    if (!reactivation.ok)
      expect(interactorFailureCodes(reactivation.error)).toEqual([CustomErrorCode.workspaceMemberLeft]);
    expect(await membership(fixture.companies.invited)).toMatchObject({ status: "inactive" });

    asSession();
    expect(await getJoinWorkspaceInteractor().invoke({ intent: fixture.intent })).toEqual({
      ok: true,
      data: { companyId: fixture.companies.invited, status: "pendingAuthorization", alreadyMember: false },
    });
    expect(await membership(fixture.companies.invited)).toEqual({
      id: joinedMemberId,
      status: "pendingAuthorization",
      roleId: null,
      leftAt: null,
      firstName: "Ben",
    });
  });

  it("withdraws a pending request and returns the login to its own workspace", async () => {
    const { getWithdrawWorkspaceRequestInteractor } = await import("@/core/di");
    asSession();

    expect(await getWithdrawWorkspaceRequestInteractor().invoke({ companyId: fixture.companies.own })).toMatchObject({
      ok: false,
    });
    expect(await membership(fixture.companies.own)).toMatchObject({ status: "active", leftAt: null });

    asSession();
    expect(await getWithdrawWorkspaceRequestInteractor().invoke({ companyId: fixture.companies.invited })).toEqual({
      ok: true,
      data: { companyId: fixture.companies.invited },
    });
    expect(await membership(fixture.companies.invited)).toMatchObject({ status: "inactive", leftAt: expect.any(Date) });
    expect(await login()).toEqual({
      activeCompanyId: fixture.companies.invited,
      lastUsedCompanyId: fixture.companies.own,
    });
    expect(await whoAmI()).toEqual({ status: 200, userId: fixture.members.own });
    expect(await login()).toEqual({ activeCompanyId: fixture.companies.own, lastUsedCompanyId: fixture.companies.own });

    asSession();
    expect(
      await getWithdrawWorkspaceRequestInteractor().invoke({ companyId: fixture.companies.invited }),
    ).toMatchObject({ ok: false });
  });
});
