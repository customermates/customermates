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
import { GET as accountMetadata } from "@/app/.well-known/oauth-protected-resource/api/v1/mcp/route";
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

  async function decide(consentCode: string, decision: { accept: boolean }) {
    const { getDecideMcpConsentInteractor } = await import("@/core/di");
    asSession();
    return getDecideMcpConsentInteractor().invoke({ consentCode, ...decision });
  }

  async function connect(resource: string | null) {
    const authorized = await authorize(resource);
    const consentCode = authorized.location.searchParams.get("consent_code") ?? "";
    const decided = await decide(consentCode, { accept: true });
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

  async function mcp(
    credential: Record<string, string>,
    workspace: Workspace | null,
    args: Record<string, unknown> = {},
  ): Promise<McpAnswer> {
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

    const refusal = async (response: Response): Promise<McpAnswer> => {
      const body = (await response.json()) as { error?: string };
      return {
        status: response.status,
        companyId: null,
        challenge: response.headers.get("www-authenticate"),
        error: body.error ?? null,
      };
    };

    const initialized = await post(mcpBody("initialize", 1));
    if (initialized.status !== 200) return refusal(initialized);
    await initialized.text();

    const called = await post(mcpBody("tools/call", 2, { name: "get_workspace_context", arguments: args }));
    if (called.status === 401) return refusal(called);
    const event = lastEvent(await called.text(), called.headers.get("content-type")) as {
      result?: {
        isError?: boolean;
        content?: Array<{ text?: string }>;
        structuredContent?: { company?: { id?: string } };
      };
    };
    return {
      status: called.status,
      companyId: event.result?.structuredContent?.company?.id ?? null,
      challenge: null,
      error: event.result?.isError ? (event.result.content?.[0]?.text ?? "tool error") : null,
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
      `Bearer resource_metadata="${BASE_URL}/.well-known/oauth-protected-resource/api/v1/mcp"`,
    );
    const suffixed = await accountMetadata(new Request(`${BASE_URL}/.well-known/oauth-protected-resource/api/v1/mcp`));
    expect(await suffixed.json()).toEqual(bareBody);
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

    const decided = await decide(consentCode, { accept: true });
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
    expect(await mcp(bearer, "bergmann", { workspace: companies.bergmann })).toMatchObject({
      companyId: companies.bergmann,
    });
    expect(await mcp(bearer, "bergmann", { workspace: companies.atlas })).toMatchObject({
      companyId: null,
      error: expect.stringContaining("locked to that workspace"),
    });
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
    const second = await authorize(workspaceUrl("bergmann"));
    const secondCode = second.location.searchParams.get("consent_code") ?? "";
    expect(secondCode).not.toBe("");

    const decided = await decide(consentCode, { accept: true });
    const issued = await exchange(
      {
        code:
          new URL(decided.ok && decided.data ? decided.data.redirectURI : "https://invalid.example").searchParams.get(
            "code",
          ) ?? "",
        verifier: authorized.verifier,
      },
      workspaceUrl("bergmann"),
    );
    expect(await tokenWorkspace(issued.body.access_token)).toBe(companies.bergmann);

    const { getAuthService } = await import("@/core/di");
    asSession();
    const forced = await getAuthService().decideMcpConsent({
      consentCode: secondCode,
      accept: true,
      companyId: companies.atlas,
      accountWide: false,
    });
    const unbound = await getAuthService().decideMcpConsent({
      consentCode: (await authorize(workspaceUrl("bergmann"))).location.searchParams.get("consent_code") ?? "",
      accept: true,
      companyId: companies.bergmann,
      accountWide: true,
    });
    expect(new URL(unbound?.redirectURI ?? "https://invalid.example").searchParams.get("error")).toBe("access_denied");
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
    expect(await mcp(key, null, { workspace: companies.atlas })).toMatchObject({ companyId: companies.atlas });
    expect(await mcp(key, null, { workspace: companies.bergmann })).toMatchObject({
      companyId: null,
      error: expect.stringContaining("An API key always works in the workspace it was created in"),
    });
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
    const {
      data: { workspaces: memberships },
    } = await getListMcpConsentWorkspacesInteractor().invoke();
    expect(memberships.find((membership) => membership.companyId === companies[workspace])?.unavailableReason).toBe(
      reason,
    );

    const decided = await decide(consentCode, { accept: true });
    const callback = new URL(decided.ok && decided.data ? decided.data.redirectURI : "https://invalid.example");
    expect(callback.searchParams.get("error")).toBe("access_denied");
    expect(callback.searchParams.get("code")).toBeNull();
  });

  it("denies a per-workspace URL of a workspace the login does not belong to", async () => {
    const authorized = await authorize(workspaceUrl("foreign"));
    const consentCode = authorized.location.searchParams.get("consent_code") ?? "";
    const { getListMcpConsentWorkspacesInteractor } = await import("@/core/di");
    asSession();

    const {
      data: { workspaces: memberships },
    } = await getListMcpConsentWorkspacesInteractor().invoke();
    expect(memberships.map((membership) => membership.companyId)).not.toContain(companies.foreign);
    const decided = await decide(consentCode, { accept: true });
    const callback = new URL(decided.ok && decided.data ? decided.data.redirectURI : "https://invalid.example");
    expect(callback.searchParams.get("error")).toBe("access_denied");
  });

  it("approves the bare endpoint for the whole account, without a default when two workspaces are usable", async () => {
    for (const resource of [`${BASE_URL}/api/v1/mcp`, null]) {
      const grant = await connect(resource);
      const issued = await exchange(grant, resource ?? undefined);

      expect(issued.status).toBe(200);
      expect(await tokenWorkspace(issued.body.access_token)).toBeNull();
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

  async function accountToken() {
    const issued = await exchange(await connect(`${BASE_URL}/api/v1/mcp`), `${BASE_URL}/api/v1/mcp`);
    return {
      bearer: { authorization: `Bearer ${issued.body.access_token}` },
      accessToken: issued.body.access_token ?? "",
    };
  }

  async function accountWideOf(accessToken: string | undefined) {
    const { rows } = await client.query<{ accountWide: boolean }>(
      'SELECT "accountWide" FROM "OauthAccessToken" WHERE "accessToken" = $1',
      [accessToken ?? ""],
    );
    return rows[0]?.accountWide;
  }

  it("marks only tokens of the account-wide consent as account-wide and keeps the mark on refresh", async () => {
    const accountGrant = await connect(`${BASE_URL}/api/v1/mcp`);
    const account = await exchange(accountGrant, `${BASE_URL}/api/v1/mcp`);
    const workspace = await exchange(await connect(workspaceUrl("bergmann")), workspaceUrl("bergmann"));
    const refresh = (refreshToken: string | undefined) =>
      token({ grant_type: "refresh_token", refresh_token: refreshToken ?? "", client_id: clientId });

    expect(await accountWideOf(account.body.access_token)).toBe(true);
    expect(await accountWideOf(workspace.body.access_token)).toBe(false);

    const accountRefreshed = await refresh(account.body.refresh_token);
    const workspaceRefreshed = await refresh(workspace.body.refresh_token);
    expect(await accountWideOf(accountRefreshed.body.access_token)).toBe(true);
    expect(await tokenWorkspace(accountRefreshed.body.access_token)).toBeNull();
    expect(await accountWideOf(workspaceRefreshed.body.access_token)).toBe(false);
    expect(await tokenWorkspace(workspaceRefreshed.body.access_token)).toBe(companies.bergmann);
  });

  it("keeps a per-workspace URL token locked to its workspace at the account URL", async () => {
    const issued = await exchange(await connect(workspaceUrl("bergmann")), workspaceUrl("bergmann"));
    const bearer = { authorization: `Bearer ${issued.body.access_token}` };

    expect(await mcp(bearer, null)).toMatchObject({ companyId: companies.bergmann });
    expect(await mcp(bearer, null, { workspace: companies.bergmann })).toMatchObject({
      companyId: companies.bergmann,
    });
    expect(await mcp(bearer, null, { workspace: companies.atlas })).toMatchObject({
      companyId: null,
      error: expect.stringContaining("approved for one workspace only"),
    });
  });

  it("keeps a token issued before account-wide connections locked to the workspace chosen back then", async () => {
    const { accessToken, bearer } = await accountToken();
    await client.query('UPDATE "OauthAccessToken" SET "companyId"=$2, "accountWide"=FALSE WHERE "accessToken"=$1', [
      accessToken,
      companies.atlas,
    ]);

    expect(await mcp(bearer, null)).toMatchObject({ companyId: companies.atlas });
    expect(await mcp(bearer, null, { workspace: companies.bergmann })).toMatchObject({
      companyId: null,
      error: expect.stringContaining("connect again"),
    });
  });

  it("lets an account-wide token choose the workspace per call and never picks one silently", async () => {
    const { bearer } = await accountToken();

    expect(await mcp(bearer, null)).toMatchObject({
      status: 200,
      companyId: null,
      error: expect.stringContaining("several workspaces"),
    });
    expect(await mcp(bearer, null, { workspace: companies.atlas })).toMatchObject({ companyId: companies.atlas });
    expect(await mcp(bearer, null, { workspace: companies.bergmann })).toMatchObject({
      companyId: companies.bergmann,
    });
    expect(await mcp(bearer, null, { workspace: companies.foreign })).toMatchObject({
      companyId: null,
      error: expect.stringContaining("has no workspace"),
    });
    for (const blocked of ["pending", "inactive", "reader", "unpaid"] as const) {
      expect(await mcp(bearer, null, { workspace: companies[blocked] })).toMatchObject({
        companyId: null,
        error: expect.stringContaining("cannot be used through MCP"),
      });
    }
  });

  it("lists the account's workspaces with what the connection can use", async () => {
    const { bearer } = await accountToken();
    requestContext.headers = new Headers({ "content-type": "application/json", ...bearer });
    const request = new Request(`${BASE_URL}/api/v1/mcp?toolsets=workspace`, {
      method: "POST",
      headers: { accept: "application/json, text/event-stream", "content-type": "application/json", ...bearer },
      body: JSON.stringify(mcpBody("tools/call", 3, { name: "list_workspaces", arguments: {} })),
    });
    const response = await bareMcp(request);
    const event = lastEvent(await response.text(), response.headers.get("content-type")) as {
      result?: { structuredContent?: { workspaces?: Array<{ companyId: string; usable: boolean; plan: unknown }> } };
    };
    const listed = event.result?.structuredContent?.workspaces ?? [];

    expect(
      listed
        .filter((workspace) => workspace.usable)
        .map((workspace) => workspace.companyId)
        .sort(),
    ).toEqual([companies.atlas, companies.bergmann].sort());
    expect(listed.find((workspace) => workspace.companyId === companies.pending)).toMatchObject({
      usable: false,
      plan: null,
    });
  });

  it("keeps the token when a membership ends, clears its default there and refuses that workspace", async () => {
    const { accessToken, bearer } = await accountToken();
    await client.query('UPDATE "OauthAccessToken" SET "companyId"=$2 WHERE "accessToken"=$1', [
      accessToken,
      companies.bergmann,
    ]);

    const { getAuthService } = await import("@/core/di");
    await getAuthService().revokeMembershipCredentials(authUserId, companies.bergmann);
    await client.query(
      'UPDATE "User" SET "status"=\'inactive\'::"Status", "leftAt"=CURRENT_TIMESTAMP WHERE "email"=$1 AND "companyId"=$2',
      [email, companies.bergmann],
    );

    expect(await tokenWorkspace(accessToken)).toBeNull();
    expect(await mcp(bearer, null, { workspace: companies.bergmann })).toMatchObject({
      companyId: null,
      error: expect.stringContaining("has no workspace"),
    });
    expect(await mcp(bearer, null)).toMatchObject({ companyId: companies.atlas });
  });
});
