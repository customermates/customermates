import { randomUUID } from "node:crypto";

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

async function connectOverMcp(apiKey: string) {
  const headers = new Headers({
    accept: "application/json, text/event-stream",
    "content-type": "application/json",
    "x-api-key": apiKey,
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
