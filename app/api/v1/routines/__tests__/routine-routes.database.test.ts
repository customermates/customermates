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
import { POST as update } from "../update/route";
import { POST as pause } from "../pause/route";
import { POST as resume } from "../resume/route";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

type Handler = (request: NextRequest) => Promise<Response>;

async function call(handler: Handler, path: string, apiKey: string, body: unknown) {
  const headers = new Headers({ "content-type": "application/json", "x-api-key": apiKey });
  requestContext.headers = headers;
  const response = await handler(
    new NextRequest(`http://localhost:4105/api/v1/routines/${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
  );
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

describeDatabase("routine REST routes over API keys", () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const ownRoutineId = randomUUID();
  const foreignRoutineId = randomUUID();
  let tenant: Awaited<ReturnType<typeof createApiKeyTenant>>;
  let foreign: Awaited<ReturnType<typeof createApiKeyTenant>>;
  let admin: { userId: string; apiKey: string };
  let reader: { userId: string; apiKey: string };
  let outsider: { userId: string; apiKey: string };

  async function insertRoutine(id: string, companyId: string, ownerUserId: string, name: string) {
    await client.query(
      `INSERT INTO "Routine" ("id", "companyId", "ownerUserId", "name", "prompt", "enabled", "triggerKind", "cronExpression", "timezone", "triggerEvents", "updatedAt")
       VALUES ($1, $2, $3, $4, 'Summarize the week', FALSE, 'schedule', '0 8 * * 1-5', 'UTC', ARRAY[]::text[], CURRENT_TIMESTAMP)`,
      [id, companyId, ownerUserId, name],
    );
  }

  beforeAll(async () => {
    await client.connect();
    tenant = await createApiKeyTenant(client, [
      { label: "routine-admin", systemRole: true },
      { label: "routine-reader", systemRole: false, permissions: [["routines", "readAll"]] },
      { label: "routine-outsider", systemRole: false },
    ]);
    foreign = await createApiKeyTenant(client, [{ label: "routine-foreign", systemRole: true }]);
    [admin, reader, outsider] = tenant.members;
    await insertRoutine(ownRoutineId, tenant.companyId, admin.userId, "Weekly digest");
    await insertRoutine(foreignRoutineId, foreign.companyId, foreign.members[0].userId, "Foreign confidential routine");
  });

  afterAll(async () => {
    await tenant?.remove();
    await foreign?.remove();
    await client.end();
  });

  it("lists and reads only the caller's workspace routines", async () => {
    const listed = await call(list, "list", admin.apiKey, {});
    expect(listed.status).toBe(200);
    expect((listed.body.items as Array<{ id: string }>).map(({ id }) => id)).toEqual([ownRoutineId]);
    expect(JSON.stringify(listed.body)).not.toContain("Foreign confidential routine");

    const own = await call(read, "read", reader.apiKey, { id: ownRoutineId });
    expect(own.status).toBe(200);
    expect(own.body).toMatchObject({ id: ownRoutineId, name: "Weekly digest", enabled: false });

    const foreignRead = await call(read, "read", admin.apiKey, { id: foreignRoutineId });
    expect(foreignRead.status).toBe(404);
    expect(foreignRead.body).toMatchObject({ error: { kind: "not_found" } });

    const foreignRuns = await call(runs, "runs", admin.apiKey, { routineId: foreignRoutineId });
    expect(foreignRuns.status).toBe(200);
    expect(foreignRuns.body).toEqual({ runs: [], nextCursor: null });
  });

  it("denies callers without the routine permissions the operation requires", async () => {
    const noRead = await call(list, "list", outsider.apiKey, {});
    expect(noRead.status).toBe(403);
    expect(noRead.body).toMatchObject({ error: { kind: "authorization" } });

    const readerPause = await call(pause, "pause", reader.apiKey, { routineId: ownRoutineId });
    expect(readerPause.status).toBe(403);

    const readerResume = await call(resume, "resume", reader.apiKey, { id: ownRoutineId });
    expect(readerResume.status).toBe(403);

    const invalidKey = await call(list, "list", "z".repeat(64), {});
    expect(invalidKey.status).toBe(401);

    const unchanged = await client.query('SELECT "enabled" FROM "Routine" WHERE "id" = $1', [ownRoutineId]);
    expect(unchanged.rows).toEqual([{ enabled: false }]);
  });

  it("refuses to change a routine from another workspace", async () => {
    const foreignUpdate = await call(update, "update", admin.apiKey, { id: foreignRoutineId, name: "Hijacked" });
    expect(foreignUpdate.status).toBe(404);

    const foreignPause = await call(pause, "pause", admin.apiKey, { routineId: foreignRoutineId });
    expect(foreignPause.status).toBe(404);

    const foreignRow = await client.query('SELECT "name", "enabled" FROM "Routine" WHERE "id" = $1', [
      foreignRoutineId,
    ]);
    expect(foreignRow.rows).toEqual([{ name: "Foreign confidential routine", enabled: false }]);
  });

  it("resumes, renames and pauses the caller's own routine through the shared interactors", async () => {
    const resumed = await call(resume, "resume", admin.apiKey, { id: ownRoutineId });
    expect(resumed.status).toBe(200);
    expect(resumed.body).toMatchObject({ id: ownRoutineId, enabled: true, cronExpression: "0 8 * * 1-5" });

    const renamed = await call(update, "update", admin.apiKey, { id: ownRoutineId, name: "Weekday digest" });
    expect(renamed.status).toBe(200);
    expect(renamed.body).toMatchObject({ id: ownRoutineId, name: "Weekday digest", enabled: true });

    const missingId = await call(update, "update", admin.apiKey, { name: "Would be created" });
    expect(missingId.status).toBe(400);

    const paused = await call(pause, "pause", admin.apiKey, { routineId: ownRoutineId });
    expect(paused.status).toBe(200);
    expect(paused.body).toMatchObject({ id: ownRoutineId, enabled: false });

    const rows = await client.query('SELECT COUNT(*)::int AS count FROM "Routine" WHERE "companyId" = $1', [
      tenant.companyId,
    ]);
    expect(rows.rows).toEqual([{ count: 1 }]);
  });
});
