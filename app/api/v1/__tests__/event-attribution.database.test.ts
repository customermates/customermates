import { randomUUID } from "node:crypto";

import { NextRequest } from "next/server";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createApiKeyTenant } from "@/tests/helpers/api-key-tenant-fixture";
import { bindFixtureCredentials } from "@/tests/helpers/bind-fixture-credentials";
import { createMockUser } from "@/tests/helpers/mock-user";

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

import { POST as mutateOverRest } from "../records/mutate/route";
import { POST as readActivities } from "../records/activities/route";
import { POST as saveRole } from "../roles/save/route";
import { POST as applyConfiguration } from "../model/apply/route";
import { POST as mcp } from "../mcp/route";

const { prisma } = await import("@/prisma/db");
const { runWithoutTenant, runWithTenant } = await import("@/core/decorators/tenant-context");

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

const KEY_NAME = "Zapier sync";
const APPLICATION_NAME = "Claude Desktop";
const REDIRECT_URI = "http://127.0.0.1:1/callback";

type ActivityItem = {
  kind: string;
  event: string;
  actor: { firstName: string; email: string; via?: { kind: string; name: string }; system?: string };
};

describeDatabase("changes made through an API key or a connected application carry their attribution", () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const clientId = randomUUID();
  const bearer = randomUUID();
  let tenant: Awaited<ReturnType<typeof createApiKeyTenant>>;
  let actorId: string;
  let apiKey: string;
  let revision: number;
  let id: (key: string) => string;

  beforeAll(async () => {
    await client.connect();
    tenant = await createApiKeyTenant(client, [{ label: "attribution", systemRole: true }]);
    [{ userId: actorId, apiKey }] = tenant.members;
    await client.query('UPDATE "Apikey" SET "name" = $1 WHERE "companyId" = $2', [KEY_NAME, tenant.companyId]);
    const authUser = await client.query<{ id: string }>(
      'SELECT a."id" FROM "AuthUser" a JOIN "User" u ON u."email" = a."email" WHERE u."id" = $1',
      [actorId],
    );
    await client.query(
      'INSERT INTO "OauthApplication" ("id", "name", "clientId", "redirectUrls", "type", "createdAt", "updatedAt") VALUES ($1, $2, $1, $3, \'public\', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
      [clientId, APPLICATION_NAME, REDIRECT_URI],
    );
    await client.query(
      'INSERT INTO "OauthAccessToken" ("id", "accessToken", "refreshToken", "accessTokenExpiresAt", "refreshTokenExpiresAt", "clientId", "userId", "scopes", "createdAt", "updatedAt") VALUES ($1, $2, $3, CURRENT_TIMESTAMP + INTERVAL \'1 hour\', CURRENT_TIMESTAMP + INTERVAL \'1 day\', $4, $5, \'openid profile email\', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
      [randomUUID(), bearer, randomUUID(), clientId, authUser.rows[0].id],
    );
    await bindFixtureCredentials(client, [tenant.companyId]);

    const { runInTransaction } = await import("@/core/decorators/transaction-runner");
    const { createCrmPreset, presetId } = await import("@/features/records/crm-preset");
    const { createTestRecordRepo, preloadTestRecordRepo } = await import("@/tests/helpers/record-repository");
    await preloadTestRecordRepo();
    id = (key) => presetId(tenant.companyId, key);
    const seeded = await runWithoutTenant(async () => ({
      user: await prisma.user.findUniqueOrThrow({ where: { id: actorId } }),
      role: await prisma.userRole.findFirstOrThrow({ where: { companyId: tenant.companyId } }),
    }));
    const admin = createMockUser({ ...seeded.user, role: { ...seeded.role, permissions: [] } });
    const repo = createTestRecordRepo();
    await runWithTenant(admin, () =>
      runInTransaction(() => repo.saveModel(createCrmPreset(tenant.companyId), admin.id), { timeout: 30000 }),
    );
    revision = (
      await runWithoutTenant(() =>
        prisma.recordSchemaState.findUniqueOrThrow({ where: { companyId: tenant.companyId } }),
      )
    ).revision;
  }, 180_000);

  afterAll(async () => {
    await client.query('DELETE FROM "OauthApplication" WHERE "id" = $1', [clientId]);
    await tenant?.remove();
    await client.end();
  });

  const restRequest = (path: string, credential: Record<string, string>, body: unknown) => {
    const headers = new Headers({ "content-type": "application/json", ...credential });
    requestContext.headers = headers;
    return new NextRequest(`http://localhost:4105/api/v1/${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  };

  const create = (name: string) => ({
    mutation: {
      action: "create" as const,
      typeId: id("deal"),
      fields: [{ fieldId: id("deal.name"), value: { kind: "text" as const, value: name } }],
    },
    expectedRevision: revision,
    idempotencyKey: randomUUID(),
  });

  const rename = (recordId: string, version: number, name: string) => ({
    mutation: {
      action: "update" as const,
      ref: { typeId: id("deal"), recordId },
      expectedVersion: version,
      fields: [{ fieldId: id("deal.name"), value: { kind: "text" as const, value: name } }],
    },
    expectedRevision: revision,
    idempotencyKey: randomUUID(),
  });

  async function mcpTool(credential: Record<string, string>, name: string, args: unknown) {
    const call = async (body: Record<string, unknown>, sessionId?: string) => {
      const headers = new Headers({
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
        ...credential,
        ...(sessionId ? { "mcp-session-id": sessionId } : {}),
      });
      requestContext.headers = headers;
      return mcp(
        new Request("http://localhost:4105/api/v1/mcp", { method: "POST", headers, body: JSON.stringify(body) }),
      );
    };
    const initialized = await call({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "attribution-test", version: "1" },
      },
    });
    expect(initialized.status).toBe(200);
    const sessionId = initialized.headers.get("mcp-session-id") ?? undefined;
    if (sessionId) await call({ jsonrpc: "2.0", method: "notifications/initialized" }, sessionId);
    const response = await call(
      { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name, arguments: args } },
      sessionId,
    );
    const text = await response.text();
    const message = response.headers.get("content-type")?.includes("application/json")
      ? JSON.parse(text)
      : text
          .split("\n")
          .filter((line) => line.startsWith("data: "))
          .map((line) => JSON.parse(line.slice(6)))
          .at(-1);
    expect(message.result?.isError, text).not.toBe(true);
    return message.result as {
      structuredContent?: { result?: { refs?: Array<{ typeId: string; recordId: string }> } };
    };
  }

  const storedEvents = (recordId: string) =>
    runWithoutTenant(() =>
      prisma.eventLog.findMany({
        where: { companyId: tenant.companyId, subjectKind: "record", subjectId: recordId },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      }),
    );

  async function history(recordId: string, credential: Record<string, string>) {
    const response = await readActivities(
      restRequest("records/activities", credential, {
        scope: { records: [{ typeId: id("deal"), recordId }], typeIds: [] },
        kinds: ["record"],
      }),
    );
    expect(response.status).toBe(200);
    return ((await response.json()) as { items: ActivityItem[] }).items;
  }

  it("stores the name of the API key with a record created over REST and returns it in the record's history", async () => {
    const credential = { "x-api-key": apiKey };
    const response = await mutateOverRest(restRequest("records/mutate", credential, create("Created over REST")));
    expect(response.status).toBe(200);
    const recordId = ((await response.json()) as { refs: Array<{ typeId: string; recordId: string }> }).refs.find(
      (ref) => ref.typeId === id("deal"),
    )?.recordId as string;

    const [event] = await storedEvents(recordId);
    expect(event).toMatchObject({ kind: "record.created", actorId, via: { kind: "apiKey", name: KEY_NAME } });
    expect(JSON.stringify(event)).not.toContain(apiKey);
    expect(event.payload).toMatchObject({ cause: { kind: "mutation" } });
    expect(JSON.stringify(event.payload)).not.toContain(KEY_NAME);

    const items = await history(recordId, credential);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      event: "record.created",
      actor: { firstName: "attribution", via: { kind: "apiKey", name: KEY_NAME } },
    });
  }, 120_000);

  it("stores the connected application of an OAuth token for an update over MCP, next to the earlier change", async () => {
    const created = await mutateOverRest(
      restRequest("records/mutate", { "x-api-key": apiKey }, create("Created before the update")),
    );
    const recordId = ((await created.json()) as { refs: Array<{ typeId: string; recordId: string }> }).refs.find(
      (ref) => ref.typeId === id("deal"),
    )?.recordId as string;

    const result = await mcpTool(
      { authorization: `Bearer ${bearer}` },
      "mutate_crm_record",
      rename(recordId, 1, "Renamed by an agent"),
    );
    expect(result.structuredContent?.result?.refs?.map((ref) => ref.recordId)).toContain(recordId);

    const events = await storedEvents(recordId);
    expect(events.map((event) => [event.kind, event.via])).toEqual([
      ["record.created", { kind: "apiKey", name: KEY_NAME }],
      ["record.updated", { kind: "oauthApplication", name: APPLICATION_NAME }],
    ]);
    expect(events.every((event) => event.actorId === actorId)).toBe(true);

    const items = await history(recordId, { authorization: `Bearer ${bearer}` });
    expect(items.map((item) => [item.event, item.actor.via])).toEqual([
      ["record.updated", { kind: "oauthApplication", name: APPLICATION_NAME }],
      ["record.created", { kind: "apiKey", name: KEY_NAME }],
    ]);
  }, 120_000);

  it("attributes an update over MCP with an API key to that key", async () => {
    const created = await mutateOverRest(
      restRequest("records/mutate", { "x-api-key": apiKey }, create("Created for the MCP key")),
    );
    const recordId = ((await created.json()) as { refs: Array<{ typeId: string; recordId: string }> }).refs.find(
      (ref) => ref.typeId === id("deal"),
    )?.recordId as string;

    await mcpTool({ "x-api-key": apiKey }, "mutate_crm_record", rename(recordId, 1, "Renamed with the key"));

    expect((await storedEvents(recordId)).map((event) => event.via)).toEqual([
      { kind: "apiKey", name: KEY_NAME },
      { kind: "apiKey", name: KEY_NAME },
    ]);
  }, 120_000);

  it("records no attribution for a change made in the app, and leaves it out of the history", async () => {
    const { getMutateRecordInteractor } = await import("@/core/di");
    const { user, role } = await runWithoutTenant(async () => ({
      user: await prisma.user.findUniqueOrThrow({ where: { id: actorId } }),
      role: await prisma.userRole.findFirstOrThrow({ where: { companyId: tenant.companyId } }),
    }));
    const admin = createMockUser({ ...user, role: { ...role, permissions: [] } });
    const result = await runWithTenant(admin, () => getMutateRecordInteractor().invoke(create("Created in the app")));
    if (!result.ok || result.data.status !== "completed") throw new Error(JSON.stringify(result));
    const recordId = result.data.refs.find((ref) => ref.typeId === id("deal"))?.recordId as string;

    const [event] = await storedEvents(recordId);
    expect(event.via).toBeNull();

    const items = await history(recordId, { "x-api-key": apiKey });
    expect(items).toHaveLength(1);
    expect(items[0].actor.via).toBeUndefined();
  }, 120_000);

  it("attributes an administrative change such as a saved role, and shows it in the activity feed", async () => {
    const response = await saveRole(
      restRequest(
        "roles/save",
        { authorization: `Bearer ${bearer}` },
        {
          name: `Attribution ${randomUUID()}`,
          description: "Saved by an agent",
          permissions: [{ resource: "api", actions: ["readAll"] }],
          recordGrants: [],
          expectedRevision: revision,
          idempotencyKey: randomUUID(),
        },
      ),
    );
    expect(response.status).toBe(200);

    const events = await runWithoutTenant(() =>
      prisma.eventLog.findMany({ where: { companyId: tenant.companyId, kind: "role.created" } }),
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ actorId, via: { kind: "oauthApplication", name: APPLICATION_NAME } });

    const feed = await readActivities(
      restRequest(
        "records/activities",
        { "x-api-key": apiKey },
        {
          scope: { records: [], typeIds: [] },
          kinds: ["audit"],
        },
      ),
    );
    expect(feed.status).toBe(200);
    const audit = ((await feed.json()) as { items: ActivityItem[] }).items.find(
      (item) => item.event === "role.created",
    );
    expect(audit?.actor.via).toEqual({ kind: "oauthApplication", name: APPLICATION_NAME });
  }, 120_000);
  it("attributes a configuration change over REST, in the stored revision and in the feed", async () => {
    const current = await runWithoutTenant(() =>
      prisma.recordSchemaState.findUniqueOrThrow({ where: { companyId: tenant.companyId } }),
    );
    const idempotencyKey = randomUUID();
    const response = await applyConfiguration(
      restRequest(
        "model/apply",
        { "x-api-key": apiKey },
        {
          expectedRevision: current.revision,
          idempotencyKey,
          operations: [
            {
              operation: "createType",
              reference: "$projects",
              label: "Project",
              pluralLabel: "Projects",
              description: "Created over REST",
              icon: "folder",
              embedded: false,
              accessPresetId: null,
            },
          ],
        },
      ),
    );
    expect(response.status).toBe(200);

    const [revision] = await runWithoutTenant(() =>
      prisma.recordSchemaRevision.findMany({
        where: { companyId: tenant.companyId, revision: { gt: current.revision } },
        orderBy: { revision: "asc" },
        take: 1,
      }),
    );
    expect(revision.actorId).toBe(actorId);
    expect(revision.change).toMatchObject({ causeId: idempotencyKey, via: { kind: "apiKey", name: KEY_NAME } });
    expect(JSON.stringify(revision.change)).not.toContain(apiKey);

    const feed = await readActivities(
      restRequest(
        "records/activities",
        { authorization: `Bearer ${bearer}` },
        { scope: { records: [], typeIds: [] }, kinds: ["configuration"] },
      ),
    );
    expect(feed.status).toBe(200);
    const items = ((await feed.json()) as { items: ActivityItem[] }).items;
    expect(items.find((item) => item.event === "record_model.updated")?.actor.via).toEqual({
      kind: "apiKey",
      name: KEY_NAME,
    });
  }, 120_000);
});
