import { randomUUID } from "node:crypto";

import { defaultKeyHasher } from "@better-auth/api-key";
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

type Workspace = "kept" | "left" | "pending" | "deactivated";

const WORKSPACES: Workspace[] = ["kept", "left", "pending", "deactivated"];

describeDatabase("credentials and invitations at the edges of a login's memberships", { timeout: 120_000 }, () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const authUserId = randomUUID();
  const email = `edges-${randomUUID()}@example.invalid`;
  const clientId = `client-${randomUUID()}`;
  const companies = Object.fromEntries(WORKSPACES.map((workspace) => [workspace, randomUUID()])) as Record<
    Workspace,
    string
  >;
  const roles = Object.fromEntries(WORKSPACES.map((workspace) => [workspace, randomUUID()])) as Record<
    Workspace,
    string
  >;
  const members = Object.fromEntries(WORKSPACES.map((workspace) => [workspace, randomUUID()])) as Record<
    Workspace,
    string
  >;
  const admins = Object.fromEntries(WORKSPACES.map((workspace) => [workspace, randomUUID()])) as Record<
    Workspace,
    string
  >;
  const refreshTokens = { kept: randomUUID(), left: randomUUID() };
  const bearers = { pending: randomUUID() };
  const keys = {
    pending: randomUUID().replaceAll("-", "").repeat(2),
    deactivated: randomUUID().replaceAll("-", "").repeat(2),
  };
  let cookie = "";
  let intent = "";

  function asSession() {
    requestContext.headers = new Headers({ cookie, "content-type": "application/json" });
  }

  async function whoAmI(credential: Record<string, string>) {
    requestContext.headers = new Headers({ "content-type": "application/json", ...credential });
    const response = await me();
    const body = (await response.json()) as { id?: string };
    return { status: response.status, userId: response.status === 200 ? (body.id ?? null) : null };
  }

  async function refresh(refreshToken: string) {
    const { auth } = await import("@/core/auth/better-auth");
    const response = await auth.handler(
      new Request("http://localhost:4000/api/auth/mcp/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: clientId }),
      }),
    );
    return { status: response.status, body: (await response.json()) as { access_token?: string; error?: string } };
  }

  async function membershipsOfLogin(workspace: Workspace) {
    const { rows } = await client.query<{ status: string; left: boolean }>(
      'SELECT status::text,"leftAt" IS NOT NULL AS left FROM "User" WHERE "companyId"=$1 AND email=$2',
      [companies[workspace], email],
    );
    return rows;
  }

  beforeAll(async () => {
    await client.connect();
    const memberStatus: Record<Workspace, string> = {
      kept: "active",
      left: "active",
      pending: "pendingAuthorization",
      deactivated: "inactive",
    };
    for (const workspace of WORKSPACES) {
      await client.query('INSERT INTO "Company" ("id","name","updatedAt") VALUES ($1,$2,CURRENT_TIMESTAMP)', [
        companies[workspace],
        `Edges ${workspace}`,
      ]);
      await client.query(
        'INSERT INTO "Subscription" ("id","companyId","status","updatedAt") VALUES ($1,$2,\'active\',CURRENT_TIMESTAMP)',
        [randomUUID(), companies[workspace]],
      );
      await client.query(
        'INSERT INTO "UserRole" ("id","name","isSystemRole","companyId","updatedAt") VALUES ($1,\'Admin\',TRUE,$2,CURRENT_TIMESTAMP)',
        [roles[workspace], companies[workspace]],
      );
      await client.query(
        'INSERT INTO "User" ("id","email","firstName","lastName","companyId","roleId","status","lastActiveAt","onboardingWizardCompletedAt","updatedAt") VALUES ($1,$2,\'Edge\',\'Member\',$3,$4,$5::"Status",CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)',
        [
          members[workspace],
          email,
          companies[workspace],
          workspace === "pending" ? null : roles[workspace],
          memberStatus[workspace],
        ],
      );
      await client.query(
        'INSERT INTO "User" ("id","email","firstName","lastName","companyId","roleId","status","lastActiveAt","onboardingWizardCompletedAt","updatedAt") VALUES ($1,$2,\'Other\',\'Admin\',$3,$4,\'active\',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)',
        [admins[workspace], `admin-${randomUUID()}@example.invalid`, companies[workspace], roles[workspace]],
      );
    }
    await client.query(
      'INSERT INTO "AuthUser" ("id","name","email","emailVerified","companyId","updatedAt") VALUES ($1,\'Edge Member\',$2,TRUE,$3,CURRENT_TIMESTAMP)',
      [authUserId, email, companies.left],
    );

    const { runWithTenant } = await import("@/core/decorators/tenant-context");
    const { InitializeRecordModelService } = await import("@/features/records/initialize-record-model.service");
    const { createTestRecordRepo } = await import("@/tests/helpers/record-repository");
    const { createMockUser } = await import("@/tests/helpers/mock-user");
    for (const workspace of WORKSPACES) {
      const owner = createMockUser({
        id: admins[workspace],
        companyId: companies[workspace],
        roleId: roles[workspace],
      });
      await runWithTenant(owner, () => new InitializeRecordModelService(createTestRecordRepo()).initialize());
    }

    await client.query(
      'INSERT INTO "OauthApplication" ("id","name","clientId","redirectUrls","type","createdAt","updatedAt") VALUES ($1,\'Edges\',$2,\'https://client.example.test/callback\',\'public\',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)',
      [randomUUID(), clientId],
    );
    for (const [accessToken, refreshToken, workspace] of [
      [randomUUID(), refreshTokens.kept, "kept"],
      [randomUUID(), refreshTokens.left, "left"],
      [bearers.pending, randomUUID(), "pending"],
    ] as const) {
      await client.query(
        'INSERT INTO "OauthAccessToken" ("id","accessToken","refreshToken","accessTokenExpiresAt","refreshTokenExpiresAt","clientId","userId","scopes","companyId","createdAt","updatedAt") VALUES ($1,$2,$3,CURRENT_TIMESTAMP + INTERVAL \'1 hour\',CURRENT_TIMESTAMP + INTERVAL \'1 day\',$4,$5,\'openid offline_access\',$6,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)',
        [randomUUID(), accessToken, refreshToken, clientId, authUserId, companies[workspace]],
      );
    }
    for (const [key, workspace] of [
      [keys.pending, "pending"],
      [keys.deactivated, "deactivated"],
    ] as const) {
      await client.query(
        'INSERT INTO "Apikey" ("id","name","key","referenceId","companyId","configId","enabled","rateLimitEnabled","requestCount","createdAt","updatedAt") VALUES ($1,\'Edges\',$2,$3,$4,\'default\',TRUE,FALSE,0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)',
        [randomUUID(), await defaultKeyHasher(key), authUserId, companies[workspace]],
      );
    }

    const inviteToken = randomUUID().replaceAll("-", "");
    const inviteExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await client.query(
      'INSERT INTO "InviteToken" ("id","token","companyId","createdById","expiresAt","updatedAt") VALUES ($1,$2,$3,$4,$5,CURRENT_TIMESTAMP)',
      [randomUUID(), inviteToken, companies.deactivated, admins.deactivated, inviteExpiresAt],
    );
    const { getOnboardingIntentService } = await import("@/core/di");
    intent = getOnboardingIntentService().issueInvitation(inviteToken, inviteExpiresAt) ?? "";

    const token = randomUUID().replaceAll("-", "");
    await client.query(
      'INSERT INTO "AuthSession" ("id","token","userId","expiresAt","activeCompanyId","updatedAt") VALUES ($1,$2,$3,$4,$5,CURRENT_TIMESTAMP)',
      [randomUUID(), token, authUserId, new Date(Date.now() + 60 * 60 * 1000), companies.left],
    );
    const { auth } = await import("@/core/auth/better-auth");
    cookie = (await serializeSignedCookie("app.session_token", token, (await auth.$context).secret)).split(";")[0];
  });

  afterAll(async () => {
    await client.query('DELETE FROM "OauthAccessToken" WHERE "userId"=$1', [authUserId]);
    await client.query('DELETE FROM "OauthApplication" WHERE "clientId"=$1', [clientId]);
    await client.query('DELETE FROM "Apikey" WHERE "referenceId"=$1', [authUserId]);
    await client.query('DELETE FROM "AuthUser" WHERE "id"=$1', [authUserId]);
    await client.query('DELETE FROM "InviteToken" WHERE "companyId"=$1', [companies.deactivated]);
    await client.query('DELETE FROM "Company" WHERE "id"=ANY($1)', [Object.values(companies)]);
    await client.end();
  });

  it("refuses to refresh the MCP connection of a workspace the login left and keeps refreshing the other one", async () => {
    const { getLeaveWorkspaceInteractor } = await import("@/core/di");
    asSession();

    expect(await getLeaveWorkspaceInteractor().invoke({ companyId: companies.left })).toEqual({
      ok: true,
      data: { companyId: companies.left },
    });

    expect(await refresh(refreshTokens.left)).toMatchObject({ status: 401, body: { error: "invalid_grant" } });
    const kept = await refresh(refreshTokens.kept);
    expect(kept.status).toBe(200);
    const stored = await client.query<{ companyId: string | null }>(
      'SELECT "companyId" FROM "OauthAccessToken" WHERE "accessToken"=$1',
      [kept.body.access_token],
    );
    expect(stored.rows).toEqual([{ companyId: companies.kept }]);
    expect(await whoAmI({ authorization: `Bearer ${kept.body.access_token}` })).toEqual({
      status: 200,
      userId: members.kept,
    });
    const leftTokens = await client.query<{ count: number }>(
      'SELECT COUNT(*)::int AS count FROM "OauthAccessToken" WHERE "userId"=$1 AND "companyId"=$2',
      [authUserId, companies.left],
    );
    expect(leftTokens.rows[0].count).toBe(0);
  });

  it("refuses the API key and MCP connection of a membership waiting for approval until it is approved", async () => {
    expect(await whoAmI({ "x-api-key": keys.pending })).toEqual({ status: 403, userId: null });
    expect(await whoAmI({ authorization: `Bearer ${bearers.pending}` })).toEqual({ status: 403, userId: null });

    await client.query('UPDATE "User" SET status=\'active\',"roleId"=$2 WHERE id=$1', [members.pending, roles.pending]);

    expect(await whoAmI({ "x-api-key": keys.pending })).toEqual({ status: 200, userId: members.pending });
    expect(await whoAmI({ authorization: `Bearer ${bearers.pending}` })).toEqual({
      status: 200,
      userId: members.pending,
    });
  });

  it("does not reactivate or duplicate a deactivated membership when the login opens a new invitation to it", async () => {
    const { getJoinWorkspaceInteractor, getListMyWorkspacesInteractor } = await import("@/core/di");
    asSession();

    expect(await getJoinWorkspaceInteractor().invoke({ intent })).toEqual({
      ok: true,
      data: { companyId: companies.deactivated, status: "inactive", alreadyMember: true },
    });

    expect(await membershipsOfLogin("deactivated")).toEqual([{ status: "inactive", left: false }]);
    expect(await whoAmI({ "x-api-key": keys.deactivated })).toEqual({ status: 403, userId: null });
    asSession();
    const { data: workspaces } = await getListMyWorkspacesInteractor().invoke();
    expect(workspaces.find((workspace) => workspace.companyId === companies.deactivated)).toMatchObject({
      status: "inactive",
      isCurrent: true,
      subscription: null,
    });
    expect(workspaces.map((workspace) => workspace.companyId).sort()).toEqual(
      [companies.kept, companies.pending, companies.deactivated].sort(),
    );
  });
});
