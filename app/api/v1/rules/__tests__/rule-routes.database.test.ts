import { randomUUID } from "node:crypto";

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

import { POST as list } from "../list/route";
import { POST as read } from "../read/route";
import { POST as runs } from "../runs/route";
import { POST as enable } from "../enable/route";
import { POST as disable } from "../disable/route";
import { POST as remove } from "../delete/route";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

type Handler = (request: NextRequest) => Promise<Response>;

async function call(handler: Handler, path: string, apiKey: string, body: unknown) {
  const headers = new Headers({ "content-type": "application/json", "x-api-key": apiKey });
  requestContext.headers = headers;
  const response = await handler(
    new NextRequest(`http://localhost:4105/api/v1/rules/${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
  );
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

describeDatabase("automation rule REST routes over API keys", () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const ownRuleId = randomUUID();
  const foreignRuleId = randomUUID();
  let tenant: Awaited<ReturnType<typeof createApiKeyTenant>>;
  let foreign: Awaited<ReturnType<typeof createApiKeyTenant>>;
  let admin: { userId: string; apiKey: string };
  let reader: { userId: string; apiKey: string };
  let outsider: { userId: string; apiKey: string };

  async function insertRule(id: string, companyId: string, ownerUserId: string, name: string) {
    await client.query(
      `INSERT INTO "AutomationRule" ("id", "companyId", "ownerUserId", "name", "enabled", "triggerKind", "trigger", "effects", "updatedAt")
       VALUES ($1, $2, $3, $4, TRUE, 'messageReceived'::"AutomationTriggerKind", '{"kind":"messageReceived","channel":"any"}',
               '[{"kind":"notify","recipients":{"ruleOwner":true},"title":"Hello"}]', CURRENT_TIMESTAMP)`,
      [id, companyId, ownerUserId, name],
    );
  }

  beforeAll(async () => {
    await client.connect();
    tenant = await createApiKeyTenant(client, [
      { label: "rule-admin", systemRole: true },
      {
        label: "rule-reader",
        systemRole: false,
        permissions: [
          ["routines", "readAll"],
          ["api", "readAll"],
        ],
      },
      { label: "rule-outsider", systemRole: false },
    ]);
    foreign = await createApiKeyTenant(client, [{ label: "rule-foreign", systemRole: true }]);
    [admin, reader, outsider] = tenant.members;
    await client.query(
      'INSERT INTO "Subscription" ("id", "companyId", "status", "updatedAt") VALUES ($1, $2, \'active\', NOW())',
      [randomUUID(), tenant.companyId],
    );
    await insertRule(ownRuleId, tenant.companyId, admin.userId, "Notify me");
    await insertRule(foreignRuleId, foreign.companyId, foreign.members[0].userId, "Foreign confidential rule");
  });

  afterAll(async () => {
    await client.query('DELETE FROM "AutomationRule" WHERE "companyId" = ANY($1)', [
      [tenant?.companyId, foreign?.companyId],
    ]);
    await tenant?.remove();
    await foreign?.remove();
    await client.end();
  });

  it("lists and reads only the caller's workspace rules", async () => {
    const listed = await call(list, "list", admin.apiKey, {});
    expect(listed.status).toBe(200);
    expect((listed.body.items as Array<{ id: string }>).map(({ id }) => id)).toEqual([ownRuleId]);
    expect(JSON.stringify(listed.body)).not.toContain("Foreign confidential rule");

    const own = await call(read, "read", reader.apiKey, { id: ownRuleId });
    expect(own.status).toBe(200);
    expect(own.body).toMatchObject({ id: ownRuleId, name: "Notify me", enabled: true });

    const foreignRead = await call(read, "read", admin.apiKey, { id: foreignRuleId });
    expect(foreignRead.status).toBe(404);
    expect(foreignRead.body).toMatchObject({ error: { kind: "not_found" } });

    const foreignRuns = await call(runs, "runs", admin.apiKey, { id: foreignRuleId });
    expect(foreignRuns.status).toBe(404);

    const ownRuns = await call(runs, "runs", reader.apiKey, { id: ownRuleId });
    expect(ownRuns.status).toBe(200);
    expect(ownRuns.body).toEqual({ runs: [], nextCursor: null });

    const brokenCursor = await call(runs, "runs", admin.apiKey, { id: ownRuleId, cursor: "nonsense" });
    expect(brokenCursor.status).toBe(400);
  });

  it("denies callers without the routine permissions the operation requires", async () => {
    const noRead = await call(list, "list", outsider.apiKey, {});
    expect(noRead.status).toBe(403);
    expect(noRead.body).toMatchObject({ error: { kind: "authorization" } });

    const readerDisable = await call(disable, "disable", reader.apiKey, { id: ownRuleId });
    expect(readerDisable.status).toBe(403);

    const readerDelete = await call(remove, "delete", reader.apiKey, { id: ownRuleId });
    expect(readerDelete.status).toBe(403);

    const invalidKey = await call(list, "list", "z".repeat(64), {});
    expect(invalidKey.status).toBe(401);

    const unchanged = await client.query('SELECT "enabled" FROM "AutomationRule" WHERE "id" = $1', [ownRuleId]);
    expect(unchanged.rows).toEqual([{ enabled: true }]);
  });

  it("refuses to change a rule from another workspace", async () => {
    const foreignDisable = await call(disable, "disable", admin.apiKey, { id: foreignRuleId });
    expect(foreignDisable.status).toBe(404);

    const foreignDelete = await call(remove, "delete", admin.apiKey, { id: foreignRuleId });
    expect(foreignDelete.status).toBe(404);

    const foreignRow = await client.query('SELECT "name", "enabled" FROM "AutomationRule" WHERE "id" = $1', [
      foreignRuleId,
    ]);
    expect(foreignRow.rows).toEqual([{ name: "Foreign confidential rule", enabled: true }]);
  });

  it("switches off, switches on and deletes the caller's own rule", async () => {
    const disabled = await call(disable, "disable", admin.apiKey, { id: ownRuleId });
    expect(disabled.status).toBe(200);
    expect(disabled.body).toMatchObject({ id: ownRuleId, enabled: false, disabledReason: "disabledByUser" });

    const enabled = await call(enable, "enable", admin.apiKey, { id: ownRuleId });
    expect(enabled.status).toBe(200);
    expect(enabled.body).toMatchObject({ id: ownRuleId, enabled: true, disabledReason: null });

    const deleted = await call(remove, "delete", admin.apiKey, { id: ownRuleId });
    expect(deleted.status).toBe(200);
    expect(deleted.body).toEqual({ deleted: true, id: ownRuleId });

    const rows = await client.query('SELECT COUNT(*)::int AS count FROM "AutomationRule" WHERE "companyId" = $1', [
      tenant.companyId,
    ]);
    expect(rows.rows).toEqual([{ count: 0 }]);
  });
});
