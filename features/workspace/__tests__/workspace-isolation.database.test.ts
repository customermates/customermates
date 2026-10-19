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

type Fixture = {
  email: string;
  authUserId: string;
  sessionId: string;
  cookie: string;
  companies: { a: string; b: string; foreign: string };
  members: { a: string; b: string; bSecondAdmin: string };
  keys: { a: string; unbound: string };
  bearerB: string;
};

async function whoAmI(credential: Record<string, string>) {
  const headers = new Headers({ "content-type": "application/json", ...credential });
  requestContext.headers = headers;
  const response = await me();
  const body = (await response.json()) as { id?: string };
  return { status: response.status, userId: response.status === 200 ? (body.id ?? null) : null };
}

function asSession(fixture: Fixture) {
  requestContext.headers = new Headers({ cookie: fixture.cookie });
}

describeDatabase("one login in several isolated workspaces", { timeout: 120_000 }, () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const createdCompanyIds: string[] = [];
  let fixture: Fixture;

  beforeAll(async () => {
    await client.connect();
    const email = `multi-${randomUUID()}@example.invalid`;
    const companies = { a: randomUUID(), b: randomUUID(), foreign: randomUUID() };
    createdCompanyIds.push(companies.a, companies.b, companies.foreign);
    const roles = { a: randomUUID(), b: randomUUID(), foreign: randomUUID() };
    const members = { a: randomUUID(), b: randomUUID(), bSecondAdmin: randomUUID() };
    const authUserId = randomUUID();

    for (const [key, companyId] of Object.entries(companies)) {
      await client.query('INSERT INTO "Company" ("id", "name", "updatedAt") VALUES ($1, $2, CURRENT_TIMESTAMP)', [
        companyId,
        `Workspace ${key}`,
      ]);
      await client.query(
        'INSERT INTO "Subscription" ("id", "companyId", "status", "updatedAt") VALUES ($1, $2, \'active\', CURRENT_TIMESTAMP)',
        [randomUUID(), companyId],
      );
      await client.query(
        'INSERT INTO "UserRole" ("id", "name", "isSystemRole", "companyId", "updatedAt") VALUES ($1, \'Admin\', TRUE, $2, CURRENT_TIMESTAMP)',
        [roles[key as keyof typeof roles], companyId],
      );
    }
    for (const [userId, companyId, roleId, userEmail] of [
      [members.a, companies.a, roles.a, email],
      [members.b, companies.b, roles.b, email],
      [members.bSecondAdmin, companies.b, roles.b, `second-${email}`],
    ]) {
      await client.query(
        'INSERT INTO "User" ("id", "email", "firstName", "lastName", "companyId", "roleId", "status", "lastActiveAt", "onboardingWizardCompletedAt", "updatedAt") VALUES ($1, $2, \'Multi\', \'Workspace\', $3, $4, \'active\', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
        [userId, userEmail, companyId, roleId],
      );
    }
    await client.query(
      'INSERT INTO "AuthUser" ("id", "name", "email", "emailVerified", "companyId", "updatedAt") VALUES ($1, \'Multi Workspace\', $2, TRUE, $3, CURRENT_TIMESTAMP)',
      [authUserId, email, companies.b],
    );

    const { runWithTenant } = await import("@/core/decorators/tenant-context");
    const { initializeStarterRecordModel } = await import("@/tests/helpers/record-repository");
    const { createMockUser } = await import("@/tests/helpers/mock-user");
    for (const [companyId, userId, roleId] of [
      [companies.a, members.a, roles.a],
      [companies.b, members.b, roles.b],
    ]) {
      const owner = createMockUser({ id: userId, companyId, roleId });
      await runWithTenant(owner, () => initializeStarterRecordModel());
    }

    const sessionId = randomUUID();
    const token = randomUUID().replaceAll("-", "");
    await client.query(
      'INSERT INTO "AuthSession" ("id", "token", "userId", "expiresAt", "updatedAt") VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)',
      [sessionId, token, authUserId, new Date(Date.now() + 60 * 60 * 1000)],
    );
    const { auth } = await import("@/core/auth/better-auth");
    const secret = (await auth.$context).secret;
    const cookie = (await serializeSignedCookie("app.session_token", token, secret)).split(";")[0];

    const keyA = randomUUID().replaceAll("-", "").repeat(2);
    const keyUnbound = randomUUID().replaceAll("-", "").repeat(2);
    for (const [key, companyId] of [
      [keyA, companies.a],
      [keyUnbound, null],
    ]) {
      await client.query(
        'INSERT INTO "Apikey" ("id", "name", "key", "referenceId", "companyId", "configId", "enabled", "rateLimitEnabled", "requestCount", "createdAt", "updatedAt") VALUES ($1, \'Multi\', $2, $3, $4, \'default\', TRUE, FALSE, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
        [randomUUID(), await defaultKeyHasher(key as string), authUserId, companyId],
      );
    }

    const clientId = `client-${randomUUID()}`;
    const bearerB = randomUUID();
    await client.query(
      'INSERT INTO "OauthApplication" ("id", "name", "clientId", "redirectUrls", "type", "createdAt", "updatedAt") VALUES ($1, \'Multi\', $2, \'http://127.0.0.1:1/callback\', \'public\', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
      [randomUUID(), clientId],
    );
    await client.query(
      'INSERT INTO "OauthAccessToken" ("id", "accessToken", "refreshToken", "accessTokenExpiresAt", "refreshTokenExpiresAt", "clientId", "userId", "scopes", "companyId", "createdAt", "updatedAt") VALUES ($1, $2, $3, CURRENT_TIMESTAMP + INTERVAL \'1 hour\', CURRENT_TIMESTAMP + INTERVAL \'1 day\', $4, $5, \'openid\', $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
      [randomUUID(), bearerB, randomUUID(), clientId, authUserId, companies.b],
    );

    fixture = {
      email,
      authUserId,
      sessionId,
      cookie,
      companies,
      members,
      keys: { a: keyA, unbound: keyUnbound },
      bearerB,
    };
  });

  afterAll(async () => {
    if (fixture) {
      await client.query(
        'DELETE FROM "OauthApplication" WHERE "clientId" IN (SELECT "clientId" FROM "OauthAccessToken" WHERE "userId" = $1)',
        [fixture.authUserId],
      );
      await client.query('DELETE FROM "Apikey" WHERE "referenceId" = $1', [fixture.authUserId]);
      await client.query('DELETE FROM "AuthUser" WHERE "id" = $1', [fixture.authUserId]);
      const created = await client.query<{ id: string }>(
        'SELECT "id" FROM "Company" WHERE "createdByAuthUserId" = $1',
        [fixture.authUserId],
      );
      createdCompanyIds.push(...created.rows.map((row) => row.id));
    }
    await client.query('DELETE FROM "Company" WHERE "id" = ANY($1)', [createdCompanyIds]);
    await client.end();
  });

  it("opens the last used workspace for a new session and remembers it on the session", async () => {
    expect(await whoAmI({ cookie: fixture.cookie })).toEqual({ status: 200, userId: fixture.members.b });

    const session = await client.query<{ activeCompanyId: string | null }>(
      'SELECT "activeCompanyId" FROM "AuthSession" WHERE "id" = $1',
      [fixture.sessionId],
    );
    expect(session.rows[0].activeCompanyId).toBe(fixture.companies.b);
  });

  it("lists every membership of the login and marks the current one", async () => {
    const { getListMyWorkspacesInteractor } = await import("@/core/di");
    asSession(fixture);

    const result = await getListMyWorkspacesInteractor().invoke();

    expect(result.data.map((workspace) => [workspace.companyId, workspace.isCurrent]).sort()).toEqual(
      [
        [fixture.companies.a, false],
        [fixture.companies.b, true],
      ].sort(),
    );
    expect(result.data.find((workspace) => workspace.companyId === fixture.companies.a)?.name).toBe("Workspace a");
  });

  it("switches the browser session between workspaces and refuses a workspace without membership", async () => {
    const { getSwitchWorkspaceInteractor } = await import("@/core/di");
    asSession(fixture);

    expect(await getSwitchWorkspaceInteractor().invoke({ companyId: fixture.companies.a })).toEqual({
      ok: true,
      data: { companyId: fixture.companies.a },
    });
    expect(await whoAmI({ cookie: fixture.cookie })).toEqual({ status: 200, userId: fixture.members.a });

    asSession(fixture);
    const refused = await getSwitchWorkspaceInteractor().invoke({ companyId: fixture.companies.foreign });
    expect(refused.ok).toBe(false);
    expect(await whoAmI({ cookie: fixture.cookie })).toEqual({ status: 200, userId: fixture.members.a });

    const login = await client.query<{ companyId: string }>('SELECT "companyId" FROM "AuthUser" WHERE "id" = $1', [
      fixture.authUserId,
    ]);
    expect(login.rows[0].companyId).toBe(fixture.companies.a);
  });

  it("keeps an API key and an MCP token in their own workspace whatever the browser session shows", async () => {
    const { getSwitchWorkspaceInteractor } = await import("@/core/di");
    asSession(fixture);
    await getSwitchWorkspaceInteractor().invoke({ companyId: fixture.companies.b });

    expect(await whoAmI({ "x-api-key": fixture.keys.a })).toEqual({ status: 200, userId: fixture.members.a });
    expect(await whoAmI({ authorization: `Bearer ${fixture.bearerB}` })).toEqual({
      status: 200,
      userId: fixture.members.b,
    });
    expect((await whoAmI({ "x-api-key": fixture.keys.unbound })).status).toBeGreaterThanOrEqual(400);
  });

  it("refuses to let the last admin leave, then leaves and revokes that workspace's credentials", async () => {
    const { getLeaveWorkspaceInteractor, getSwitchWorkspaceInteractor } = await import("@/core/di");
    const { MessagingService } = await import("@/ee/messaging/messaging.service");
    const providerRemoval = vi.spyOn(MessagingService.prototype, "deleteAccount").mockResolvedValue(undefined);
    const channelId = randomUUID();
    await client.query(
      'INSERT INTO "ConnectedAccount" ("id", "companyId", "userId", "unipileAccountId", "provider", "status", "updatedAt") VALUES ($1, $2, $3, $4, \'google\', \'ok\', CURRENT_TIMESTAMP)',
      [channelId, fixture.companies.b, fixture.members.b, `unipile-${randomUUID()}`],
    );
    await client.query(
      'INSERT INTO "User" ("id", "email", "firstName", "lastName", "companyId", "status", "createdAt", "updatedAt") VALUES ($1, $2, \'Multi\', \'Workspace\', $3, \'pendingAuthorization\', CURRENT_TIMESTAMP - INTERVAL \'1 year\', CURRENT_TIMESTAMP)',
      [randomUUID(), fixture.email, fixture.companies.foreign],
    );
    asSession(fixture);
    await getSwitchWorkspaceInteractor().invoke({ companyId: fixture.companies.b });
    await client.query('UPDATE "User" SET "status" = \'inactive\' WHERE "id" = $1', [fixture.members.bSecondAdmin]);

    asSession(fixture);
    const refused = await getLeaveWorkspaceInteractor().invoke({ companyId: fixture.companies.b });
    expect(refused.ok).toBe(false);

    await client.query('UPDATE "User" SET "status" = \'active\' WHERE "id" = $1', [fixture.members.bSecondAdmin]);
    asSession(fixture);
    expect(await getLeaveWorkspaceInteractor().invoke({ companyId: fixture.companies.b })).toEqual({
      ok: true,
      data: { companyId: fixture.companies.b },
    });

    const left = await client.query<{ status: string; leftAt: Date | null }>(
      'SELECT "status", "leftAt" FROM "User" WHERE "id" = $1',
      [fixture.members.b],
    );
    expect(left.rows[0].status).toBe("inactive");
    expect(left.rows[0].leftAt).not.toBeNull();
    const channel = await client.query<{ status: string }>('SELECT "status" FROM "ConnectedAccount" WHERE "id" = $1', [
      channelId,
    ]);
    expect(channel.rows[0].status).toBe("deleted");
    expect(providerRemoval).toHaveBeenCalledOnce();
    providerRemoval.mockRestore();
    const login = await client.query<{ companyId: string | null }>(
      'SELECT "companyId" FROM "AuthUser" WHERE "id" = $1',
      [fixture.authUserId],
    );
    expect(login.rows[0].companyId).toBe(fixture.companies.a);
    expect((await whoAmI({ authorization: `Bearer ${fixture.bearerB}` })).status).toBeGreaterThanOrEqual(400);
    expect(await whoAmI({ cookie: fixture.cookie })).toEqual({ status: 200, userId: fixture.members.a });
    expect(await whoAmI({ "x-api-key": fixture.keys.a })).toEqual({ status: 200, userId: fixture.members.a });

    asSession(fixture);
    const switchBack = await getSwitchWorkspaceInteractor().invoke({ companyId: fixture.companies.b });
    expect(switchBack.ok).toBe(false);
  });

  it("creates a further workspace for the login with its own admin role and switches to it", async () => {
    const { getCreateWorkspaceInteractor } = await import("@/core/di");
    asSession(fixture);

    const created = await getCreateWorkspaceInteractor().invoke({ name: "  Taxes  ", agreeToTerms: false });
    if (!created.ok) throw new Error("workspace creation failed");

    const company = await client.query<{ name: string; createdByAuthUserId: string }>(
      'SELECT "name", "createdByAuthUserId" FROM "Company" WHERE "id" = $1',
      [created.data.companyId],
    );
    expect(company.rows[0]).toEqual({ name: "Taxes", createdByAuthUserId: fixture.authUserId });
    const owner = await client.query<{ id: string; status: string; isSystemRole: boolean }>(
      'SELECT u."id", u."status", r."isSystemRole" FROM "User" u JOIN "UserRole" r ON r."id" = u."roleId" WHERE u."companyId" = $1 AND u."email" = $2',
      [created.data.companyId, fixture.email],
    );
    expect(owner.rows[0]).toMatchObject({ status: "active", isSystemRole: true });
    const subscription = await client.query<{ status: string }>(
      'SELECT "status" FROM "Subscription" WHERE "companyId" = $1',
      [created.data.companyId],
    );
    expect(subscription.rows[0].status).toBe("active");
    expect(await whoAmI({ cookie: fixture.cookie })).toEqual({ status: 200, userId: owner.rows[0].id });
    expect(await whoAmI({ "x-api-key": fixture.keys.a })).toEqual({ status: 200, userId: fixture.members.a });
  });
});
