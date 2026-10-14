import { randomUUID } from "node:crypto";

import { defaultKeyHasher } from "@better-auth/api-key";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

const requestContext = vi.hoisted(() => ({ headers: new Headers() }));

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(requestContext.headers),
  cookies: () =>
    Promise.resolve({
      get: () => undefined,
      getAll: () => [],
      set: () => undefined,
      delete: () => undefined,
    }),
}));
vi.mock("next-intl/server", () => ({
  getLocale: () => Promise.resolve("en"),
  getTranslations: () => {
    const translate = (key: string) => key;
    return Promise.resolve(Object.assign(translate, { raw: translate }));
  },
}));

import { POST } from "../route";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;
const MCP_URL = "http://localhost:4000/api/v1/mcp?toolsets=wiki";

type RpcEnvelope = {
  result?: {
    capabilities?: Record<string, unknown>;
    instructions?: string;
    tools?: Array<{ name: string }>;
    resources?: Array<Record<string, unknown>>;
    resourceTemplates?: Array<Record<string, unknown>>;
    contents?: Array<{ uri: string; text: string }>;
    structuredContent?: Record<string, unknown>;
    content?: Array<Record<string, unknown>>;
    isError?: boolean;
    _meta?: unknown;
  };
  error?: { code: number; message: string };
};

function mcpBody(method: string, id?: number, params?: Record<string, unknown>) {
  return {
    jsonrpc: "2.0",
    ...(id === undefined ? {} : { id }),
    method,
    ...(method === "initialize"
      ? {
          params: {
            protocolVersion: "2025-03-26",
            capabilities: { resources: {} },
            clientInfo: { name: "wiki-auth-transport-test", version: "1" },
          },
        }
      : params
        ? { params }
        : {}),
  };
}

function parseRpcResponse(text: string, contentType: string | null) {
  if (contentType?.includes("application/json")) return JSON.parse(text) as RpcEnvelope;

  return text
    .split("\n")
    .filter((line) => line.startsWith("data: "))
    .map((line) => JSON.parse(line.slice(6)) as RpcEnvelope)
    .at(-1);
}

async function rpc(apiKey: string, body: Record<string, unknown>, sessionId?: string, endpoint = MCP_URL) {
  const headers = new Headers({
    accept: "application/json, text/event-stream",
    "content-type": "application/json",
    "x-api-key": apiKey,
    ...(sessionId ? { "mcp-session-id": sessionId } : {}),
  });
  requestContext.headers = headers;
  const response = await POST(
    new Request(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
  );
  const text = await response.text();
  return {
    response,
    data: parseRpcResponse(text, response.headers.get("content-type")),
    text,
  };
}

async function initialize(apiKey: string, endpoint = MCP_URL) {
  const initialized = await rpc(apiKey, mcpBody("initialize", 1), undefined, endpoint);
  expect(initialized.response.status).toBe(200);
  const sessionId = initialized.response.headers.get("mcp-session-id") ?? undefined;
  if (sessionId) await rpc(apiKey, mcpBody("notifications/initialized"), sessionId, endpoint);
  return { ...initialized, sessionId };
}

describeDatabase("Workspace Wiki authenticated MCP transport", () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const companyId = randomUUID();
  const foreignCompanyId = randomUUID();
  const managerRoleId = randomUUID();
  const readerRoleId = randomUUID();
  const managerUserId = randomUUID();
  const readerUserId = randomUUID();
  const managerAuthUserId = randomUUID();
  const readerAuthUserId = randomUUID();
  const managerApiKeyId = randomUUID();
  const readerApiKeyId = randomUUID();
  const expiredApiKeyId = randomUUID();
  const readablePageId = randomUUID();
  const foreignPageId = randomUUID();
  const managerApiKey = randomUUID().replaceAll("-", "").repeat(2);
  const readerApiKey = randomUUID().replaceAll("-", "").repeat(2);
  const expiredApiKey = randomUUID().replaceAll("-", "").repeat(2);
  const outsiderRoleId = randomUUID();
  const outsiderUserId = randomUUID();
  const outsiderAuthUserId = randomUUID();
  const outsiderApiKeyId = randomUUID();
  const outsiderApiKey = randomUUID().replaceAll("-", "").repeat(2);
  const oauthClientId = randomUUID();
  const managerBearer = randomUUID();
  const outsiderBearer = randomUUID();

  beforeAll(async () => {
    await client.connect();
    await client.query(
      'INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, CURRENT_TIMESTAMP), ($2, CURRENT_TIMESTAMP)',
      [companyId, foreignCompanyId],
    );
    await client.query(
      'INSERT INTO "UserRole" ("id", "name", "isSystemRole", "companyId", "updatedAt") VALUES ($1, $2, TRUE, $3, CURRENT_TIMESTAMP), ($4, $5, FALSE, $3, CURRENT_TIMESTAMP)',
      [managerRoleId, "MCP Wiki manager", companyId, readerRoleId, "MCP Wiki reader"],
    );
    await client.query(
      'INSERT INTO "RolePermission" ("id", "roleId", "companyId", "resource", "action") VALUES ($1, $2, $3, \'wiki\', \'readAll\')',
      [randomUUID(), readerRoleId, companyId],
    );
    await client.query(
      'INSERT INTO "RolePermission" ("id", "roleId", "companyId", "resource", "action") VALUES ($1, $2, $3, \'api\', \'readAll\')',
      [randomUUID(), readerRoleId, companyId],
    );
    await client.query(
      'INSERT INTO "User" ("id", "email", "firstName", "lastName", "companyId", "roleId", "status", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, \'active\', CURRENT_TIMESTAMP), ($7, $8, $3, $4, $5, $9, \'active\', CURRENT_TIMESTAMP)',
      [
        managerUserId,
        `wiki-manager-${managerUserId}@example.invalid`,
        "Wiki",
        "Transport",
        companyId,
        managerRoleId,
        readerUserId,
        `wiki-reader-${readerUserId}@example.invalid`,
        readerRoleId,
      ],
    );
    await client.query(
      'INSERT INTO "AuthUser" ("id", "name", "email", "emailVerified", "companyId", "updatedAt") VALUES ($1, $2, $3, TRUE, $4, CURRENT_TIMESTAMP), ($5, $2, $6, TRUE, $4, CURRENT_TIMESTAMP)',
      [
        managerAuthUserId,
        "Wiki Transport",
        `wiki-manager-${managerUserId}@example.invalid`,
        companyId,
        readerAuthUserId,
        `wiki-reader-${readerUserId}@example.invalid`,
      ],
    );
    await client.query(
      'INSERT INTO "Apikey" ("id", "name", "key", "referenceId", "configId", "enabled", "rateLimitEnabled", "requestCount", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, \'default\', TRUE, FALSE, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP), ($5, $6, $7, $8, \'default\', TRUE, FALSE, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
      [
        managerApiKeyId,
        "Wiki transport manager",
        await defaultKeyHasher(managerApiKey),
        managerAuthUserId,
        readerApiKeyId,
        "Wiki transport reader",
        await defaultKeyHasher(readerApiKey),
        readerAuthUserId,
      ],
    );
    await client.query(
      'INSERT INTO "Apikey" ("id", "name", "key", "referenceId", "configId", "enabled", "rateLimitEnabled", "requestCount", "expiresAt", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, \'default\', TRUE, FALSE, 0, CURRENT_TIMESTAMP - INTERVAL \'1 day\', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
      [expiredApiKeyId, "Wiki transport expired", await defaultKeyHasher(expiredApiKey), managerAuthUserId],
    );
    await client.query(
      'INSERT INTO "WikiPage" ("id", "companyId", "title", "markdown", "updatedAt") VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP), ($5, $6, $7, $8, CURRENT_TIMESTAMP)',
      [
        readablePageId,
        companyId,
        "Read-only MCP fixture",
        "reader-key-discovery-phrase",
        foreignPageId,
        foreignCompanyId,
        "Foreign confidential page",
        "foreign-tenant-only-phrase",
      ],
    );
  });

  beforeAll(async () => {
    await client.query(
      'INSERT INTO "UserRole" ("id", "name", "isSystemRole", "companyId", "updatedAt") VALUES ($1, $2, FALSE, $3, CURRENT_TIMESTAMP)',
      [outsiderRoleId, "MCP Wiki reader without API access", companyId],
    );
    await client.query(
      'INSERT INTO "RolePermission" ("id", "roleId", "companyId", "resource", "action") VALUES ($1, $2, $3, \'wiki\', \'readAll\')',
      [randomUUID(), outsiderRoleId, companyId],
    );
    const email = `wiki-outsider-${outsiderUserId}@example.invalid`;
    await client.query(
      'INSERT INTO "User" ("id", "email", "firstName", "lastName", "companyId", "roleId", "status", "updatedAt") VALUES ($1, $2, \'Wiki\', \'Outsider\', $3, $4, \'active\', CURRENT_TIMESTAMP)',
      [outsiderUserId, email, companyId, outsiderRoleId],
    );
    await client.query(
      'INSERT INTO "AuthUser" ("id", "name", "email", "emailVerified", "companyId", "updatedAt") VALUES ($1, \'Wiki Outsider\', $2, TRUE, $3, CURRENT_TIMESTAMP)',
      [outsiderAuthUserId, email, companyId],
    );
    await client.query(
      'INSERT INTO "Apikey" ("id", "name", "key", "referenceId", "configId", "enabled", "rateLimitEnabled", "requestCount", "createdAt", "updatedAt") VALUES ($1, \'Wiki transport outsider\', $2, $3, \'default\', TRUE, FALSE, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
      [outsiderApiKeyId, await defaultKeyHasher(outsiderApiKey), outsiderAuthUserId],
    );
    await client.query(
      'INSERT INTO "OauthApplication" ("id", "name", "clientId", "redirectUrls", "type", "createdAt", "updatedAt") VALUES ($1, \'MCP permission test\', $1, \'http://127.0.0.1:1/callback\', \'public\', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
      [oauthClientId],
    );
    for (const [token, authUserId] of [
      [managerBearer, managerAuthUserId],
      [outsiderBearer, outsiderAuthUserId],
    ]) {
      await client.query(
        'INSERT INTO "OauthAccessToken" ("id", "accessToken", "refreshToken", "accessTokenExpiresAt", "refreshTokenExpiresAt", "clientId", "userId", "scopes", "createdAt", "updatedAt") VALUES ($1, $2, $3, CURRENT_TIMESTAMP + INTERVAL \'1 hour\', CURRENT_TIMESTAMP + INTERVAL \'1 day\', $4, $5, \'openid profile email\', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
        [randomUUID(), token, randomUUID(), oauthClientId, authUserId],
      );
    }
  });

  afterAll(async () => {
    await client.query('DELETE FROM "OauthApplication" WHERE "id" = $1', [oauthClientId]);
    await client.query('DELETE FROM "Apikey" WHERE "id" = ANY($1)', [
      [managerApiKeyId, readerApiKeyId, expiredApiKeyId, outsiderApiKeyId],
    ]);
    await client.query('DELETE FROM "AuthUser" WHERE "id" = ANY($1)', [
      [managerAuthUserId, readerAuthUserId, outsiderAuthUserId],
    ]);
    await client.query('DELETE FROM "Company" WHERE "id" = ANY($1)', [[companyId, foreignCompanyId]]);
    await client.end();
  });

  it("refuses API key and OAuth connections without Read access All on API & Webhooks with a 403", async () => {
    const connect = async (credential: Record<string, string>) => {
      const headers = new Headers({
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
        ...credential,
      });
      requestContext.headers = headers;
      const response = await POST(
        new Request(MCP_URL, { method: "POST", headers, body: JSON.stringify(mcpBody("initialize", 50)) }),
      );
      return { status: response.status, body: await response.text() };
    };

    const refusedCredentials: Array<Record<string, string>> = [
      { "x-api-key": outsiderApiKey },
      { authorization: `Bearer ${outsiderBearer}` },
    ];
    for (const credential of refusedCredentials) {
      const refused = await connect(credential);
      expect(refused.status, Object.keys(credential)[0]).toBe(403);
      expect(JSON.parse(refused.body)).toMatchObject({
        error: "insufficient_permissions",
        requiredPermission: { resource: "api", action: "readAll" },
      });
    }
    const permittedCredentials: Array<Record<string, string>> = [
      { "x-api-key": readerApiKey },
      { "x-api-key": managerApiKey },
      { authorization: `Bearer ${managerBearer}` },
    ];
    for (const credential of permittedCredentials)
      expect((await connect(credential)).status, Object.values(credential)[0].slice(0, 6)).toBe(200);
  });

  it("rejects missing, invalid and expired API keys with the OAuth challenge", async () => {
    const headers = new Headers({
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
    });
    requestContext.headers = headers;
    const missing = await POST(
      new Request(MCP_URL, {
        method: "POST",
        headers,
        body: JSON.stringify(mcpBody("initialize", 30)),
      }),
    );
    expect(missing.status).toBe(401);
    expect(missing.headers.get("www-authenticate")).toContain("oauth-protected-resource");

    for (const rejectedKey of ["z".repeat(64), "pb6-not-a-valid-key", expiredApiKey]) {
      const initialized = await rpc(rejectedKey, mcpBody("initialize", 31));
      expect(initialized.response.status, rejectedKey === expiredApiKey ? "expired" : "invalid").toBe(401);
      expect(initialized.response.headers.get("www-authenticate")).toContain("oauth-protected-resource");
      const docs = await rpc(
        rejectedKey,
        mcpBody("tools/call", 32, { name: "search_docs", arguments: { query: "pipeline" } }),
        undefined,
        "http://localhost:4000/api/v1/mcp?toolsets=docs",
      );
      expect(docs.response.status).toBe(401);
      expect(docs.text).not.toContain("reader-key-discovery-phrase");
    }
  });

  it("discovers, writes, searches, follows, renames, and isolates Wiki pages through the production MCP route", async () => {
    const initialized = await initialize(managerApiKey);
    expect(initialized.data?.result?.capabilities).toHaveProperty("resources");
    expect(initialized.data?.result?.instructions).toContain(
      "Fetch every relevant wiki:<uuid> result at its returned offset",
    );
    expect(initialized.data?.result?.instructions).toContain(
      "manage_wiki_pages lists and searches Knowledge Base pages",
    );

    const listedTools = await rpc(managerApiKey, mcpBody("tools/list", 2), initialized.sessionId);
    expect(listedTools.data?.result?.tools?.map(({ name }) => name)).toEqual(["manage_wiki_pages", "search", "fetch"]);

    const listedResources = await rpc(managerApiKey, mcpBody("resources/list", 3), initialized.sessionId);
    expect(listedResources.data?.result?.resources).toEqual([
      expect.objectContaining({
        uri: "customermates://wiki/catalog?page=1",
        name: "workspace-wiki-catalog",
      }),
    ]);
    const listedTemplates = await rpc(managerApiKey, mcpBody("resources/templates/list", 4), initialized.sessionId);
    expect(listedTemplates.data?.result?.resourceTemplates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          uriTemplate: "customermates://wiki/catalog{?page}",
        }),
        expect.objectContaining({
          uriTemplate: "customermates://wiki/page/{id}",
        }),
      ]),
    );

    const workspaceEndpoint = "http://localhost:4000/api/v1/mcp?toolsets=wiki,workspace";
    const workspaceInitialized = await initialize(managerApiKey, workspaceEndpoint);
    const workspaceContext = await rpc(
      managerApiKey,
      mcpBody("tools/call", 40, {
        name: "get_workspace_context",
        arguments: {},
      }),
      workspaceInitialized.sessionId,
      workspaceEndpoint,
    );
    expect(workspaceContext.data?.result?.structuredContent, workspaceContext.text).toMatchObject({
      company: { id: companyId },
      wiki: {
        items: expect.arrayContaining([
          expect.objectContaining({
            id: readablePageId,
            url: `http://localhost:4000/wiki?page=${readablePageId}`,
          }),
        ]),
      },
    });

    const targetCreated = await rpc(
      managerApiKey,
      mcpBody("tools/call", 5, {
        name: "manage_wiki_pages",
        arguments: {
          action: "create",
          pages: [
            {
              title: "Support escalation",
              markdown: "Escalate uncertain answers to the support lead.",
            },
          ],
        },
      }),
      initialized.sessionId,
    );
    expect(targetCreated.data?.result?.isError).not.toBe(true);
    const target = (
      targetCreated.data?.result?.structuredContent as {
        items: Array<{ id: string; updatedAt: string; url: string }>;
      }
    ).items[0];

    const sourceCreated = await rpc(
      managerApiKey,
      mcpBody("tools/call", 6, {
        name: "manage_wiki_pages",
        arguments: {
          action: "create",
          pages: [
            {
              title: "Company voice",
              markdown: `Use plain language. Read [Support](/wiki?page=${target.id}). unique-voice-transport-phrase`,
            },
          ],
        },
      }),
      initialized.sessionId,
    );
    const source = (
      sourceCreated.data?.result?.structuredContent as {
        items: Array<{ id: string; url: string }>;
      }
    ).items[0];

    const catalogRead = await rpc(
      managerApiKey,
      mcpBody("resources/read", 7, {
        uri: "customermates://wiki/catalog?page=1",
      }),
      initialized.sessionId,
    );
    const catalog = JSON.parse(catalogRead.data?.result?.contents?.[0]?.text ?? "{}") as {
      items: Array<{ id: string; url: string }>;
    };
    expect(catalog.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: target.id, url: target.url }),
        expect.objectContaining({ id: source.id, url: source.url }),
      ]),
    );

    const searched = await rpc(
      managerApiKey,
      mcpBody("tools/call", 8, {
        name: "search",
        arguments: { query: "unique voice transport phrase" },
      }),
      initialized.sessionId,
    );
    const searchResults = (
      searched.data?.result?.structuredContent as {
        results: Array<{ id: string; title: string; url: string }>;
      }
    ).results;
    expect(searchResults).toContainEqual(
      expect.objectContaining({ id: `wiki:${source.id}`, title: "Company voice", url: source.url, offset: 0 }),
    );

    const sourceFetched = await rpc(
      managerApiKey,
      mcpBody("tools/call", 9, {
        name: "fetch",
        arguments: { id: source.url },
      }),
      initialized.sessionId,
    );
    const fetchedSource = sourceFetched.data?.result?.structuredContent as {
      text: string;
      metadata: { outgoingWikiLinks: string };
    };
    expect(fetchedSource.text).toContain(target.url);
    const outgoingLinks = JSON.parse(fetchedSource.metadata.outgoingWikiLinks) as Array<{
      id: string;
      url: string;
      fetchId: string;
    }>;
    expect(outgoingLinks).toEqual([
      expect.objectContaining({
        id: target.id,
        url: target.url,
        fetchId: `wiki:${target.id}`,
      }),
    ]);

    const targetFetched = await rpc(
      managerApiKey,
      mcpBody("tools/call", 10, {
        name: "fetch",
        arguments: { id: outgoingLinks[0].url },
      }),
      initialized.sessionId,
    );
    expect(targetFetched.data?.result?.structuredContent).toMatchObject({
      id: `wiki:${target.id}`,
      title: "Support escalation",
      url: target.url,
    });

    const targetUpdated = await rpc(
      managerApiKey,
      mcpBody("tools/call", 11, {
        name: "manage_wiki_pages",
        arguments: {
          action: "update",
          id: target.id,
          expectedUpdatedAt: target.updatedAt,
          title: "Support handoff",
        },
      }),
      initialized.sessionId,
    );
    expect(targetUpdated.data?.result?.structuredContent).toMatchObject({
      id: target.id,
      title: "Support handoff",
      url: target.url,
    });

    const targetResource = await rpc(
      managerApiKey,
      mcpBody("resources/read", 12, { uri: `customermates://wiki/page/${target.id}` }),
      initialized.sessionId,
    );
    expect(targetResource.data?.result?.contents?.[0]).toMatchObject({
      uri: `customermates://wiki/page/${target.id}`,
      text: "Escalate uncertain answers to the support lead.",
    });

    const foreignSearch = await rpc(
      managerApiKey,
      mcpBody("tools/call", 13, {
        name: "search",
        arguments: { query: "foreign tenant only phrase" },
      }),
      initialized.sessionId,
    );
    expect(JSON.stringify(foreignSearch.data?.result?.structuredContent)).not.toContain(foreignPageId);
    const foreignFetch = await rpc(
      managerApiKey,
      mcpBody("tools/call", 14, {
        name: "fetch",
        arguments: { id: `wiki:${foreignPageId}` },
      }),
      initialized.sessionId,
    );
    expect(foreignFetch.data?.result).toMatchObject({ isError: true });
    expect(foreignFetch.text).not.toContain("foreign-tenant-only-phrase");

    const auditRows = await client.query<{ event: string; entityId: string }>(
      'SELECT kind AS "event", "subjectId" AS "entityId" FROM "EventLog" WHERE "companyId" = $1 AND "subjectKind" = \'wiki_page\' AND "subjectId" = ANY($2)',
      [companyId, [target.id, source.id]],
    );
    expect(auditRows.rows).toEqual(
      expect.arrayContaining([
        { event: "wiki_page.created", entityId: target.id },
        { event: "wiki_page.created", entityId: source.id },
        { event: "wiki_page.updated", entityId: target.id },
      ]),
    );
  }, 30_000);

  it("lets a Wiki Read API key discover content but rejects MCP mutations", async () => {
    const initialized = await initialize(readerApiKey);
    const searched = await rpc(
      readerApiKey,
      mcpBody("tools/call", 20, {
        name: "search",
        arguments: { query: "reader key discovery phrase" },
      }),
      initialized.sessionId,
    );
    expect(
      (
        searched.data?.result?.structuredContent as {
          results: Array<{ title: string }>;
        }
      ).results,
    ).toContainEqual(
      expect.objectContaining({
        id: `wiki:${readablePageId}`,
        title: "Read-only MCP fixture",
      }),
    );

    const denied = await rpc(
      readerApiKey,
      mcpBody("tools/call", 21, {
        name: "manage_wiki_pages",
        arguments: {
          action: "create",
          pages: [{ title: "Denied", markdown: "Must not be created." }],
        },
      }),
      initialized.sessionId,
    );
    expect(denied.data?.result).toMatchObject({
      isError: true,
      _meta: { failure: { kind: "authorization" } },
    });
    const deniedRows = await client.query('SELECT 1 FROM "WikiPage" WHERE "companyId" = $1 AND "title" = $2', [
      companyId,
      "Denied",
    ]);
    expect(deniedRows.rowCount).toBe(0);
  }, 30_000);
});
