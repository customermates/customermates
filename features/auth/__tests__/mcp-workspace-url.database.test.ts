import { createHash, randomBytes, randomUUID } from "node:crypto";

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

import { GET as bareMetadata } from "@/app/.well-known/oauth-protected-resource/route";
import { GET as workspaceMetadata } from "@/app/.well-known/oauth-protected-resource/api/v1/mcp/w/[workspaceId]/route";
import { POST as bareMcp } from "@/app/api/v1/mcp/route";
import { POST as workspaceMcp } from "@/app/api/v1/mcp/w/[workspaceId]/route";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

const BASE_URL = "http://localhost:4000";
const REDIRECT_URI = "https://connector.example.test/callback";

type Workspace = "atlas" | "bergmann" | "pending" | "inactive" | "reader" | "unpaid" | "foreign";
type McpAnswer = { status: number; companyId: string | null; challenge: string | null; error: string | null };

const WORKSPACES: Workspace[] = ["atlas", "bergmann", "pending", "inactive", "reader", "unpaid", "foreign"];

function mcpBody(method: string, id: number, params?: Record<string, unknown>) {
  return {
    jsonrpc: "2.0",
    id,
    method,
    params: params ?? {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "mcp-workspace-url-test", version: "1" },
    },
  };
}

function lastEvent(text: string, contentType: string | null) {
  if (contentType?.includes("application/json")) return JSON.parse(text) as Record<string, unknown>;

  const events = text
    .split("\n")
    .filter((line) => line.startsWith("data: "))
    .map((line) => JSON.parse(line.slice(6)) as Record<string, unknown>);
  return events.at(-1) ?? {};
}

describeDatabase("per-workspace MCP URLs against the database", { timeout: 180_000 }, () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const authUserId = randomUUID();
  const email = `mcp-url-${randomUUID()}@example.invalid`;
  const clientId = `connector-${randomUUID()}`;
  const apiKey = randomUUID().replaceAll("-", "").repeat(2);
  const companies = Object.fromEntries(WORKSPACES.map((workspace) => [workspace, randomUUID()])) as Record<
    Workspace,
    string
  >;
  const sessionId = randomUUID();
  let cookie = "";

  const workspaceUrl = (workspace: Workspace) => `${BASE_URL}/api/v1/mcp/w/${companies[workspace]}`;

  function asSession() {
    requestContext.headers = new Headers({ cookie, "content-type": "application/json" });
  }

  async function auth() {
    return (await import("@/core/auth/better-auth")).auth;
  }

  async function authorize(resource: string | null, options: { prompt?: boolean } = {}) {
    const verifier = randomBytes(32).toString("base64url");
    const state = `state-${randomUUID()}`;
    const query = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: REDIRECT_URI,
      scope: "openid offline_access",
      state,
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
      ...(options.prompt === false ? {} : { prompt: "consent" }),
      ...(resource ? { resource } : {}),
    });
    const response = await (
      await auth()
    ).handler(new Request(`${BASE_URL}/api/auth/mcp/authorize?${query}`, { headers: { cookie } }));
    return { status: response.status, location: new URL(response.headers.get("location") ?? "/", BASE_URL), verifier };
  }

  async function decide(consentCode: string, decision: { accept: boolean; companyId?: string }) {
    const { getDecideMcpConsentInteractor } = await import("@/core/di");
    asSession();
    return getDecideMcpConsentInteractor().invoke({ consentCode, ...decision });
  }

  async function connect(resource: string | null, companyId?: string) {
    const authorized = await authorize(resource);
    const consentCode = authorized.location.searchParams.get("consent_code") ?? "";
    const decided = await decide(consentCode, { accept: true, ...(companyId ? { companyId } : {}) });
    const callback = new URL(decided.ok && decided.data ? decided.data.redirectURI : "https://invalid.example");
    return { code: callback.searchParams.get("code") ?? "", verifier: authorized.verifier, consentCode, decided };
  }

  async function token(fields: Record<string, string>) {
    const response = await (
      await auth()
    ).handler(
      new Request(`${BASE_URL}/api/auth/mcp/token`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(fields),
      }),
    );
    return {
      status: response.status,
      body: (await response.json()) as { access_token?: string; refresh_token?: string; error?: string },
    };
  }

  async function exchange(grant: { code: string; verifier: string }, resource?: string) {
    return token({
      grant_type: "authorization_code",
      code: grant.code,
      client_id: clientId,
      redirect_uri: REDIRECT_URI,
      code_verifier: grant.verifier,
      ...(resource ? { resource } : {}),
    });
  }

  async function tokenWorkspace(accessToken: string | undefined) {
    const { rows } = await client.query<{ companyId: string | null }>(
      'SELECT "companyId" FROM "OauthAccessToken" WHERE "accessToken" = $1',
      [accessToken ?? ""],
    );
    return rows[0]?.companyId;
  }

  async function mcp(credential: Record<string, string>, workspace: Workspace | null): Promise<McpAnswer> {
    const url = workspace
      ? `${workspaceUrl(workspace)}?toolsets=workspace`
      : `${BASE_URL}/api/v1/mcp?toolsets=workspace`;
    const headers = new Headers({
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
      ...credential,
    });
    const post = (body: Record<string, unknown>) => {
      requestContext.headers = headers;
      const request = new Request(url, { method: "POST", headers, body: JSON.stringify(body) });
      return workspace
        ? workspaceMcp(request, { params: Promise.resolve({ workspaceId: companies[workspace] }) })
        : bareMcp(request);
    };

    const initialized = await post(mcpBody("initialize", 1));
    if (initialized.status !== 200) {
      const body = (await initialized.json()) as { error?: string };
      return {
        status: initialized.status,
        companyId: null,
        challenge: initialized.headers.get("www-authenticate"),
        error: body.error ?? null,
      };
    }
    await initialized.text();

    const called = await post(mcpBody("tools/call", 2, { name: "get_workspace_context", arguments: {} }));
    const event = lastEvent(await called.text(), called.headers.get("content-type")) as {
      result?: { structuredContent?: { company?: { id?: string } } };
    };
    return {
      status: called.status,
      companyId: event.result?.structuredContent?.company?.id ?? null,
      challenge: null,
      error: null,
    };
  }

  beforeAll(async () => {
    await client.connect();
    const subscriptionStatus: Record<Workspace, string> = {
      atlas: "active",
      bergmann: "active",
      pending: "active",
      inactive: "active",
      reader: "active",
      unpaid: "expired",
      foreign: "active",
    };
    const memberStatus: Partial<Record<Workspace, string>> = {
      atlas: "active",
      bergmann: "active",
      pending: "pendingAuthorization",
      inactive: "inactive",
      reader: "active",
      unpaid: "active",
    };
    for (const workspace of WORKSPACES) {
      const adminRoleId = randomUUID();
      await client.query('INSERT INTO "Company" ("id","name","updatedAt") VALUES ($1,$2,CURRENT_TIMESTAMP)', [
        companies[workspace],
        `MCP URL ${workspace}`,
      ]);
      await client.query(
        'INSERT INTO "Subscription" ("id","companyId","status","updatedAt") VALUES ($1,$2,$3::"SubscriptionStatus",CURRENT_TIMESTAMP)',
        [randomUUID(), companies[workspace], subscriptionStatus[workspace]],
      );
      await client.query(
        'INSERT INTO "UserRole" ("id","name","isSystemRole","companyId","updatedAt") VALUES ($1,\'Admin\',TRUE,$2,CURRENT_TIMESTAMP)',
        [adminRoleId, companies[workspace]],
      );
      const status = memberStatus[workspace];
      if (!status) continue;

      let roleId: string | null = workspace === "pending" ? null : adminRoleId;
      if (workspace === "reader") {
        roleId = randomUUID();
        await client.query(
          'INSERT INTO "UserRole" ("id","name","isSystemRole","companyId","updatedAt") VALUES ($1,\'Reader\',FALSE,$2,CURRENT_TIMESTAMP)',
          [roleId, companies[workspace]],
        );
      }
      await client.query(
        'INSERT INTO "User" ("id","email","firstName","lastName","companyId","roleId","status","lastActiveAt","onboardingWizardCompletedAt","updatedAt") VALUES ($1,$2,\'Mcp\',\'Url\',$3,$4,$5::"Status",CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)',
        [randomUUID(), email, companies[workspace], roleId, status],
      );
    }
    await client.query(
      'INSERT INTO "AuthUser" ("id","name","email","emailVerified","companyId","updatedAt") VALUES ($1,\'Mcp Url\',$2,TRUE,$3,CURRENT_TIMESTAMP)',
      [authUserId, email, companies.atlas],
    );
    await client.query(
      'INSERT INTO "OauthApplication" ("id","name","clientId","redirectUrls","type","createdAt","updatedAt") VALUES ($1,\'Claude\',$2,$3,\'public\',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)',
      [randomUUID(), clientId, REDIRECT_URI],
    );
    await client.query(
      'INSERT INTO "Apikey" ("id","name","key","referenceId","companyId","configId","enabled","rateLimitEnabled","requestCount","createdAt","updatedAt") VALUES ($1,\'Atlas key\',$2,$3,$4,\'default\',TRUE,FALSE,0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)',
      [randomUUID(), await defaultKeyHasher(apiKey), authUserId, companies.atlas],
    );
    const sessionToken = randomUUID().replaceAll("-", "");
    await client.query(
      'INSERT INTO "AuthSession" ("id","token","userId","expiresAt","activeCompanyId","updatedAt") VALUES ($1,$2,$3,$4,$5,CURRENT_TIMESTAMP)',
      [sessionId, sessionToken, authUserId, new Date(Date.now() + 60 * 60 * 1000), companies.atlas],
    );
    cookie = (
      await serializeSignedCookie("app.session_token", sessionToken, (await (await auth()).$context).secret)
    ).split(";")[0];
  });

  afterAll(async () => {
    await client.query('DELETE FROM "OauthAccessToken" WHERE "userId"=$1', [authUserId]);
    await client.query('DELETE FROM "OauthConsent" WHERE "userId"=$1', [authUserId]);
    await client.query('DELETE FROM "AuthVerification" WHERE "value" LIKE $1 OR "value" = ANY($2)', [
      `%${authUserId}%`,
      Object.values(companies),
    ]);
    await client.query('DELETE FROM "OauthApplication" WHERE "clientId"=$1', [clientId]);
    await client.query('DELETE FROM "Apikey" WHERE "referenceId"=$1', [authUserId]);
    await client.query('DELETE FROM "AuthUser" WHERE "id"=$1', [authUserId]);
    await client.query('DELETE FROM "Company" WHERE "id"=ANY($1)', [Object.values(companies)]);
    await client.end();
  });

  it("describes a workspace's MCP URL as its own protected resource next to the bare endpoint", async () => {
    const bare = await bareMetadata(new Request(`${BASE_URL}/.well-known/oauth-protected-resource`));
    const scoped = await workspaceMetadata(
      new Request(`${BASE_URL}/.well-known/oauth-protected-resource/api/v1/mcp/w/${companies.bergmann}`),
      { params: Promise.resolve({ workspaceId: companies.bergmann }) },
    );
    const bareBody = (await bare.json()) as Record<string, unknown>;
    const scopedBody = (await scoped.json()) as Record<string, unknown>;

    expect(bareBody.resource).toBe(`${BASE_URL}/api/v1/mcp`);
    expect(scopedBody).toEqual({ ...bareBody, resource: workspaceUrl("bergmann") });
    expect(scopedBody.authorization_servers).toEqual([BASE_URL]);

    const challenged = await mcp({}, "bergmann");
    expect(challenged).toMatchObject({ status: 401, error: "unauthorized" });
    expect(challenged.challenge).toBe(
      `Bearer resource_metadata="${BASE_URL}/.well-known/oauth-protected-resource/api/v1/mcp/w/${companies.bergmann}"`,
    );
    expect((await mcp({}, null)).challenge).toBe(
      `Bearer resource_metadata="${BASE_URL}/.well-known/oauth-protected-resource"`,
    );
  });

  it("binds a connection through a workspace's URL to that workspace while the session works in another one", async () => {
    const authorized = await authorize(workspaceUrl("bergmann"));
    expect(authorized.status).toBe(302);
    expect(authorized.location.pathname).toBe("/auth/mcp-consent");
    const consentCode = authorized.location.searchParams.get("consent_code") ?? "";

    const { getAuthService } = await import("@/core/di");
    asSession();
    expect(await getAuthService().getMcpConsentPrompt({ consentCode, clientId })).toMatchObject({
      clientName: "Claude",
      workspaceId: companies.bergmann,
    });

    const decided = await decide(consentCode, { accept: true, companyId: companies.bergmann });
    const callback = new URL(decided.ok && decided.data ? decided.data.redirectURI : "https://invalid.example");
    expect(callback.origin + callback.pathname).toBe(REDIRECT_URI);
    const issued = await exchange(
      { code: callback.searchParams.get("code") ?? "", verifier: authorized.verifier },
      workspaceUrl("bergmann"),
    );

    expect(issued.status).toBe(200);
    expect(await tokenWorkspace(issued.body.access_token)).toBe(companies.bergmann);
    const session = await client.query<{ activeCompanyId: string }>(
      'SELECT "activeCompanyId" FROM "AuthSession" WHERE "id"=$1',
      [sessionId],
    );
    const login = await client.query<{ companyId: string }>('SELECT "companyId" FROM "AuthUser" WHERE "id"=$1', [
      authUserId,
    ]);
    expect(session.rows[0].activeCompanyId).toBe(companies.atlas);
    expect(login.rows[0].companyId).toBe(companies.atlas);

    const bearer = { authorization: `Bearer ${issued.body.access_token}` };
    expect(await mcp(bearer, "bergmann")).toMatchObject({ status: 200, companyId: companies.bergmann });
    expect(await mcp(bearer, null)).toMatchObject({ status: 200, companyId: companies.bergmann });
    const foreign = await mcp(bearer, "atlas");
    expect(foreign).toMatchObject({ status: 401, error: "invalid_token" });
    expect(foreign.challenge).toContain('error="invalid_token"');
    expect(foreign.challenge).toContain(
      `resource_metadata="${BASE_URL}/.well-known/oauth-protected-resource/api/v1/mcp/w/${companies.atlas}"`,
    );
  });

  it("connects two workspaces with the same client and login in parallel, each token reaching only its own", async () => {
    const atlasGrant = await connect(workspaceUrl("atlas"));
    const bergmannGrant = await connect(workspaceUrl("bergmann"));
    const atlas = await exchange(atlasGrant, workspaceUrl("atlas"));
    const bergmann = await exchange(bergmannGrant, workspaceUrl("bergmann"));

    expect(await tokenWorkspace(atlas.body.access_token)).toBe(companies.atlas);
    expect(await tokenWorkspace(bergmann.body.access_token)).toBe(companies.bergmann);
    const consents = await client.query<{ count: number }>(
      'SELECT COUNT(*)::int AS count FROM "OauthConsent" WHERE "userId"=$1 AND "clientId"=$2',
      [authUserId, clientId],
    );
    expect(consents.rows[0].count).toBe(1);

    const atlasBearer = { authorization: `Bearer ${atlas.body.access_token}` };
    const bergmannBearer = { authorization: `Bearer ${bergmann.body.access_token}` };
    expect(await mcp(atlasBearer, "atlas")).toMatchObject({ status: 200, companyId: companies.atlas });
    expect(await mcp(bergmannBearer, "bergmann")).toMatchObject({ status: 200, companyId: companies.bergmann });
    expect(await mcp(atlasBearer, "bergmann")).toMatchObject({ status: 401, error: "invalid_token" });
    expect(await mcp(bergmannBearer, "atlas")).toMatchObject({ status: 401, error: "invalid_token" });
  });

  it("binds a re-authorization of the already approved client to the URL's workspace, never the last used one", async () => {
    await client.query('UPDATE "AuthUser" SET "companyId"=$2 WHERE "id"=$1', [authUserId, companies.atlas]);
    const consents = await client.query<{ count: number }>(
      'SELECT COUNT(*)::int AS count FROM "OauthConsent" WHERE "userId"=$1 AND "clientId"=$2 AND "consentGiven"=TRUE',
      [authUserId, clientId],
    );
    expect(consents.rows[0].count).toBe(1);

    const again = await connect(workspaceUrl("bergmann"));
    const reissued = await exchange(again, workspaceUrl("bergmann"));
    expect(await tokenWorkspace(reissued.body.access_token)).toBe(companies.bergmann);

    const skipped = await authorize(workspaceUrl("bergmann"), { prompt: false });
    expect(skipped.location.origin + skipped.location.pathname).toBe(REDIRECT_URI);
    const before = await client.query<{ count: number }>(
      'SELECT COUNT(*)::int AS count FROM "OauthAccessToken" WHERE "userId"=$1',
      [authUserId],
    );
    const refused = await exchange(
      { code: skipped.location.searchParams.get("code") ?? "", verifier: skipped.verifier },
      workspaceUrl("bergmann"),
    );
    const after = await client.query<{ count: number }>(
      'SELECT COUNT(*)::int AS count FROM "OauthAccessToken" WHERE "userId"=$1',
      [authUserId],
    );
    expect(refused).toMatchObject({ status: 401, body: { error: "invalid_grant" } });
    expect(after.rows[0].count).toBe(before.rows[0].count);
  });

  it("never lets a decision move a per-workspace authorization to another workspace", async () => {
    const authorized = await authorize(workspaceUrl("bergmann"));
    const consentCode = authorized.location.searchParams.get("consent_code") ?? "";

    expect(await decide(consentCode, { accept: true, companyId: companies.atlas })).toEqual({ ok: true, data: null });

    const { getAuthService } = await import("@/core/di");
    asSession();
    const forced = await getAuthService().decideMcpConsent({ consentCode, accept: true, companyId: companies.atlas });
    const callback = new URL(forced?.redirectURI ?? "https://invalid.example");
    expect(callback.searchParams.get("error")).toBe("access_denied");
    expect(callback.searchParams.get("code")).toBeNull();
  });

  it("refuses a token request or refresh whose resource names another workspace than the grant", async () => {
    const grant = await connect(workspaceUrl("bergmann"));
    const mismatched = await exchange(grant, workspaceUrl("atlas"));
    expect(mismatched).toMatchObject({ status: 400, body: { error: "invalid_target" } });

    const issued = await exchange(await connect(workspaceUrl("bergmann")), workspaceUrl("bergmann"));
    const refresh = (resource?: string) =>
      token({
        grant_type: "refresh_token",
        refresh_token: issued.body.refresh_token ?? "",
        client_id: clientId,
        ...(resource ? { resource } : {}),
      });
    const count = async () =>
      (
        await client.query<{ count: number }>(
          'SELECT COUNT(*)::int AS count FROM "OauthAccessToken" WHERE "userId"=$1',
          [authUserId],
        )
      ).rows[0].count;

    const kept = await refresh(workspaceUrl("bergmann"));
    const plain = await refresh();
    expect(kept.status).toBe(200);
    expect(await tokenWorkspace(kept.body.access_token)).toBe(companies.bergmann);
    expect(await tokenWorkspace(plain.body.access_token)).toBe(companies.bergmann);

    const tokens = await count();
    expect(await refresh(workspaceUrl("atlas"))).toMatchObject({ status: 400, body: { error: "invalid_target" } });
    expect(await count()).toBe(tokens);
    expect(await mcp({ authorization: `Bearer ${kept.body.access_token}` }, "bergmann")).toMatchObject({
      status: 200,
      companyId: companies.bergmann,
    });
  });

  it("serves an API key only at its own workspace's URL and unchanged at the bare endpoint", async () => {
    const key = { "x-api-key": apiKey };

    expect(await mcp(key, "atlas")).toMatchObject({ status: 200, companyId: companies.atlas });
    expect(await mcp(key, null)).toMatchObject({ status: 200, companyId: companies.atlas });
    expect(await mcp(key, "bergmann")).toMatchObject({ status: 403, error: "workspace_mismatch", challenge: null });
    expect(await mcp({ "x-api-key": "z".repeat(64) }, "atlas")).toMatchObject({ status: 401, error: "unauthorized" });
  });

  it.each([
    ["pending", "pending"],
    ["inactive", "inactive"],
    ["reader", "permission"],
    ["unpaid", "plan"],
  ] as const)("explains and denies a per-workspace URL of a %s membership", async (workspace, reason) => {
    const authorized = await authorize(workspaceUrl(workspace));
    const consentCode = authorized.location.searchParams.get("consent_code") ?? "";
    const { getAuthService, getListMcpConsentWorkspacesInteractor } = await import("@/core/di");
    asSession();

    expect((await getAuthService().getMcpConsentPrompt({ consentCode, clientId }))?.workspaceId).toBe(
      companies[workspace],
    );
    const { data: memberships } = await getListMcpConsentWorkspacesInteractor().invoke();
    expect(memberships.find((membership) => membership.companyId === companies[workspace])?.unavailableReason).toBe(
      reason,
    );

    const decided = await decide(consentCode, { accept: true, companyId: companies[workspace] });
    const callback = new URL(decided.ok && decided.data ? decided.data.redirectURI : "https://invalid.example");
    expect(callback.searchParams.get("error")).toBe("access_denied");
    expect(callback.searchParams.get("code")).toBeNull();
  });

  it("denies a per-workspace URL of a workspace the login does not belong to", async () => {
    const authorized = await authorize(workspaceUrl("foreign"));
    const consentCode = authorized.location.searchParams.get("consent_code") ?? "";
    const { getListMcpConsentWorkspacesInteractor } = await import("@/core/di");
    asSession();

    const { data: memberships } = await getListMcpConsentWorkspacesInteractor().invoke();
    expect(memberships.map((membership) => membership.companyId)).not.toContain(companies.foreign);
    const decided = await decide(consentCode, { accept: true });
    const callback = new URL(decided.ok && decided.data ? decided.data.redirectURI : "https://invalid.example");
    expect(callback.searchParams.get("error")).toBe("access_denied");
  });

  it("keeps the bare endpoint's picker binding for the bare resource and for no resource", async () => {
    for (const resource of [`${BASE_URL}/api/v1/mcp`, null]) {
      const grant = await connect(resource, companies.bergmann);
      const issued = await exchange(grant, resource ?? undefined);

      expect(issued.status).toBe(200);
      expect(await tokenWorkspace(issued.body.access_token)).toBe(companies.bergmann);
    }
    const authorized = await authorize(`${BASE_URL}/api/v1/mcp`);
    const { getAuthService } = await import("@/core/di");
    asSession();
    expect(
      (
        await getAuthService().getMcpConsentPrompt({
          consentCode: authorized.location.searchParams.get("consent_code") ?? "",
          clientId,
        })
      )?.workspaceId,
    ).toBeNull();
  });
});
