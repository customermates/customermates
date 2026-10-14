import { createHash, randomUUID } from "node:crypto";

import { serializeSignedCookie } from "better-call";
import { NextRequest } from "next/server";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createApiKeyTenant } from "@/tests/helpers/api-key-tenant-fixture";

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

import { POST as listRoutines } from "../routines/list/route";
import { POST as mcp } from "../mcp/route";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

async function listOverRest(credential: Record<string, string>) {
  const headers = new Headers({ "content-type": "application/json", ...credential });
  requestContext.headers = headers;
  const response = await listRoutines(
    new NextRequest("http://localhost:4105/api/v1/routines/list", { method: "POST", headers, body: "{}" }),
  );
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

async function connectOverMcp(credential: string | Record<string, string>) {
  const headers = new Headers({
    accept: "application/json, text/event-stream",
    "content-type": "application/json",
    ...(typeof credential === "string" ? { "x-api-key": credential } : credential),
  });
  requestContext.headers = headers;
  const response = await mcp(
    new Request("http://localhost:4105/api/v1/mcp", {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "w109", version: "1" } },
      }),
    }),
  );
  return { status: response.status, body: await response.text() };
}

const REDIRECT_URI = "https://client.example.test/callback";

async function postToken(fields: Record<string, string>) {
  const { auth } = await import("@/core/auth/better-auth");
  const response = await auth.handler(
    new Request("http://localhost:4000/api/auth/mcp/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(fields),
    }),
  );
  expect(response.status).toBe(200);
  return (await response.json()) as { access_token: string; refresh_token: string };
}

async function issueOAuthTokens(client: Client, authUserId: string, clientId: string) {
  const verifier = randomUUID() + randomUUID();
  const consentCode = randomUUID();
  await client.query(
    'INSERT INTO "AuthVerification" ("id", "identifier", "value", "expiresAt", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
    [
      randomUUID(),
      consentCode,
      JSON.stringify({
        clientId,
        redirectURI: REDIRECT_URI,
        scope: ["openid", "offline_access"],
        userId: authUserId,
        authTime: Date.now(),
        requireConsent: true,
        state: "state",
        codeChallenge: createHash("sha256").update(verifier).digest("base64url"),
        codeChallengeMethod: "s256",
      }),
      new Date(Date.now() + 10 * 60 * 1000),
    ],
  );
  const { AuthService } = await import("@/features/auth/auth.service");
  const service = new AuthService({ send: vi.fn() } as never);
  vi.spyOn(service, "getSession").mockResolvedValue({ user: { id: authUserId } } as never);
  const decision = await service.decideMcpConsent({ consentCode, accept: true });
  const code = new URL(decision?.redirectURI ?? "").searchParams.get("code") ?? "";
  return postToken({
    grant_type: "authorization_code",
    code,
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    code_verifier: verifier,
  });
}

describeDatabase("MCP OAuth tokens after the owner's role loses API & Webhooks read access", () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const clientId = `client-${randomUUID()}`;
  let tenant: Awaited<ReturnType<typeof createApiKeyTenant>>;
  let member: { userId: string; apiKey: string };
  let authUserId: string;

  beforeAll(async () => {
    await client.connect();
    tenant = await createApiKeyTenant(client, [
      {
        label: "oauth-revocation",
        systemRole: false,
        permissions: [
          ["api", "readAll"],
          ["routines", "readAll"],
        ],
      },
    ]);
    [member] = tenant.members;
    const authUser = await client.query<{ id: string }>(
      'SELECT a."id" FROM "AuthUser" a JOIN "User" u ON u."email" = a."email" WHERE u."id" = $1',
      [member.userId],
    );
    authUserId = authUser.rows[0].id;
    await client.query(
      'INSERT INTO "OauthApplication" ("id", "name", "clientId", "redirectUrls", "type", "createdAt", "updatedAt") VALUES ($1, \'OAuth revocation\', $2, $3, \'public\', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
      [randomUUID(), clientId, REDIRECT_URI],
    );
  });

  afterAll(async () => {
    await client.query('DELETE FROM "OauthAccessToken" WHERE "clientId" = $1', [clientId]);
    await client.query('DELETE FROM "OauthConsent" WHERE "clientId" = $1', [clientId]);
    await client.query('DELETE FROM "OauthApplication" WHERE "clientId" = $1', [clientId]);
    await tenant?.remove();
    await client.end();
  });

  it("refuses the bearer on REST and MCP once the permission is removed, also after a refresh", async () => {
    const tokens = await issueOAuthTokens(client, authUserId, clientId);
    const bearer = { authorization: `Bearer ${tokens.access_token}` };
    expect((await listOverRest(bearer)).status).toBe(200);
    expect((await connectOverMcp(bearer)).status).toBe(200);

    await client.query(
      `DELETE FROM "RolePermission" WHERE "resource" = 'api' AND "roleId" = (SELECT "roleId" FROM "User" WHERE "id" = $1)`,
      [member.userId],
    );

    const rest = await listOverRest(bearer);
    expect(rest.status).toBe(403);
    expect(rest.body).toMatchObject({
      error: { kind: "authorization", issues: [expect.objectContaining({ customCode: "insufficientPermissions" })] },
    });
    expect((await connectOverMcp(bearer)).status).toBe(403);

    const refreshed = await postToken({
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token,
      client_id: clientId,
    });
    const refreshedBearer = { authorization: `Bearer ${refreshed.access_token}` };
    expect(refreshed.access_token).not.toBe(tokens.access_token);
    expect((await listOverRest(refreshedBearer)).status).toBe(403);
    expect((await connectOverMcp(refreshedBearer)).status).toBe(403);
  });
});

describeDatabase("API keys after the owner's role loses API & Webhooks read access", () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  let tenant: Awaited<ReturnType<typeof createApiKeyTenant>>;
  let member: { userId: string; apiKey: string };
  let sessionCookie: string;

  beforeAll(async () => {
    await client.connect();
    tenant = await createApiKeyTenant(client, [
      {
        label: "api-key-revocation",
        systemRole: false,
        permissions: [
          ["api", "readAll"],
          ["routines", "readAll"],
        ],
      },
    ]);
    [member] = tenant.members;

    const authUser = await client.query<{ id: string }>(
      'SELECT a."id" FROM "AuthUser" a JOIN "User" u ON u."email" = a."email" WHERE u."id" = $1',
      [member.userId],
    );
    const token = randomUUID().replaceAll("-", "");
    await client.query(
      'INSERT INTO "AuthSession" ("id", "token", "userId", "expiresAt", "updatedAt") VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)',
      [randomUUID(), token, authUser.rows[0].id, new Date(Date.now() + 60 * 60 * 1000)],
    );
    const { auth } = await import("@/core/auth/better-auth");
    const secret = (await auth.$context).secret;
    sessionCookie = (await serializeSignedCookie("app.session_token", token, secret)).split(";")[0];
  });

  afterAll(async () => {
    await tenant?.remove();
    await client.end();
  });

  it("refuses the same key on REST and MCP once the permission is removed, while the session keeps working", async () => {
    expect((await listOverRest({ "x-api-key": member.apiKey })).status).toBe(200);
    expect((await connectOverMcp(member.apiKey)).status).toBe(200);

    await client.query(
      `DELETE FROM "RolePermission" WHERE "resource" = 'api' AND "roleId" = (SELECT "roleId" FROM "User" WHERE "id" = $1)`,
      [member.userId],
    );

    const rest = await listOverRest({ "x-api-key": member.apiKey });
    expect(rest.status).toBe(403);
    expect(rest.body).toMatchObject({
      error: { kind: "authorization", issues: [expect.objectContaining({ customCode: "insufficientPermissions" })] },
    });

    const refused = await connectOverMcp(member.apiKey);
    expect(refused.status).toBe(403);
    expect(JSON.parse(refused.body)).toMatchObject({
      error: "insufficient_permissions",
      requiredPermission: { resource: "api", action: "readAll" },
    });

    const session = await listOverRest({ cookie: sessionCookie });
    expect(session.status).toBe(200);
    expect(session.body).toMatchObject({ items: [] });
  });
});
