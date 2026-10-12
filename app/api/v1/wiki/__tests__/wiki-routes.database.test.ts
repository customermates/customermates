import { randomUUID } from "node:crypto";

import { defaultKeyHasher } from "@better-auth/api-key";
import { NextRequest } from "next/server";
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

import { POST as listPages } from "../list/route";
import { POST as searchPages } from "../search/route";
import { POST as readPage } from "../read/route";
import { POST as createPages } from "../create/route";
import { POST as updatePage } from "../update/route";
import { POST as movePage } from "../move/route";
import { POST as deletePage } from "../delete/route";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

type Handler = (request: NextRequest) => Promise<Response>;
type Page = { id: string; title: string; markdown: string; updatedAt: string };

async function call(handler: Handler, apiKey: string, path: string, body: unknown) {
  const headers = new Headers({ "content-type": "application/json", "x-api-key": apiKey });
  requestContext.headers = headers;
  const response = await handler(
    new NextRequest(`http://localhost:4000/api/v1/wiki/${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
  );
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

describeDatabase("Knowledge Base REST routes", () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const companyId = randomUUID();
  const foreignCompanyId = randomUUID();
  const managerRoleId = randomUUID();
  const readerRoleId = randomUUID();
  const managerUserId = randomUUID();
  const readerUserId = randomUUID();
  const managerAuthUserId = randomUUID();
  const readerAuthUserId = randomUUID();
  const apiKeyIds = [randomUUID(), randomUUID()];
  const managerKey = randomUUID().replaceAll("-", "").repeat(2);
  const readerKey = randomUUID().replaceAll("-", "").repeat(2);
  const readablePageId = randomUUID();
  const foreignPageId = randomUUID();

  beforeAll(async () => {
    await client.connect();
    await client.query(
      'INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, CURRENT_TIMESTAMP), ($2, CURRENT_TIMESTAMP)',
      [companyId, foreignCompanyId],
    );
    await client.query(
      'INSERT INTO "UserRole" ("id", "name", "isSystemRole", "companyId", "updatedAt") VALUES ($1, $2, TRUE, $3, CURRENT_TIMESTAMP), ($4, $5, FALSE, $3, CURRENT_TIMESTAMP)',
      [managerRoleId, "REST Wiki manager", companyId, readerRoleId, "REST Wiki reader"],
    );
    await client.query(
      'INSERT INTO "RolePermission" ("id", "roleId", "companyId", "resource", "action") VALUES ($1, $2, $3, \'wiki\', \'readAll\'), ($4, $2, $3, \'api\', \'readAll\')',
      [randomUUID(), readerRoleId, companyId, randomUUID()],
    );
    await client.query(
      'INSERT INTO "User" ("id", "email", "firstName", "lastName", "companyId", "roleId", "status", "updatedAt") VALUES ($1, $2, \'Wiki\', \'Manager\', $3, $4, \'active\', CURRENT_TIMESTAMP), ($5, $6, \'Wiki\', \'Reader\', $3, $7, \'active\', CURRENT_TIMESTAMP)',
      [
        managerUserId,
        `rest-wiki-manager-${managerUserId}@example.invalid`,
        companyId,
        managerRoleId,
        readerUserId,
        `rest-wiki-reader-${readerUserId}@example.invalid`,
        readerRoleId,
      ],
    );
    await client.query(
      'INSERT INTO "AuthUser" ("id", "name", "email", "emailVerified", "companyId", "updatedAt") VALUES ($1, \'Wiki Manager\', $2, TRUE, $3, CURRENT_TIMESTAMP), ($4, \'Wiki Reader\', $5, TRUE, $3, CURRENT_TIMESTAMP)',
      [
        managerAuthUserId,
        `rest-wiki-manager-${managerUserId}@example.invalid`,
        companyId,
        readerAuthUserId,
        `rest-wiki-reader-${readerUserId}@example.invalid`,
      ],
    );
    await client.query(
      'INSERT INTO "Apikey" ("id", "name", "key", "referenceId", "configId", "enabled", "rateLimitEnabled", "requestCount", "createdAt", "updatedAt") VALUES ($1, \'REST wiki manager\', $2, $3, \'default\', TRUE, FALSE, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP), ($4, \'REST wiki reader\', $5, $6, \'default\', TRUE, FALSE, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
      [
        apiKeyIds[0],
        await defaultKeyHasher(managerKey),
        managerAuthUserId,
        apiKeyIds[1],
        await defaultKeyHasher(readerKey),
        readerAuthUserId,
      ],
    );
    await client.query(
      'INSERT INTO "WikiPage" ("id", "companyId", "title", "markdown", "updatedAt") VALUES ($1, $2, \'Readable REST fixture\', \'rest-reader-discovery-phrase\', CURRENT_TIMESTAMP), ($3, $4, \'Foreign confidential page\', \'rest-foreign-tenant-phrase\', CURRENT_TIMESTAMP)',
      [readablePageId, companyId, foreignPageId, foreignCompanyId],
    );
  });

  afterAll(async () => {
    await client.query('DELETE FROM "Apikey" WHERE "id" = ANY($1)', [apiKeyIds]);
    await client.query('DELETE FROM "AuthUser" WHERE "id" = ANY($1)', [[managerAuthUserId, readerAuthUserId]]);
    await client.query('DELETE FROM "Company" WHERE "id" = ANY($1)', [[companyId, foreignCompanyId]]);
    await client.end();
  });

  it("rejects an unknown API key without reading pages", async () => {
    const denied = await call(listPages, "z".repeat(64), "list", {});

    expect(denied.status).toBe(401);
    expect(denied.body).toMatchObject({ error: { kind: "authentication" } });
    expect(JSON.stringify(denied.body)).not.toContain("Readable REST fixture");
  });

  it("creates, lists, searches, reads, updates, moves and trashes pages with a manager key", async () => {
    const created = await call(createPages, managerKey, "create", {
      pages: [
        { title: "REST voice", markdown: "Use plain words. rest-unique-voice-phrase" },
        {
          title: "REST escalation",
          kind: "procedure",
          whenToUse: "A customer reports an outage.",
          markdown: "1. Confirm the account.\n2. Call the support lead.",
        },
      ],
    });
    expect(created.status, JSON.stringify(created.body)).toBe(200);
    const [voice, escalation] = created.body as unknown as Page[];
    expect(voice.title).toBe("REST voice");

    const listed = await call(listPages, managerKey, "list", { pageSize: 25 });
    expect(listed.status).toBe(200);
    expect((listed.body.items as Page[]).map(({ id }) => id)).toEqual(
      expect.arrayContaining([readablePageId, voice.id, escalation.id]),
    );
    expect(listed.body.items).not.toContainEqual(expect.objectContaining({ id: foreignPageId }));

    const procedures = await call(listPages, managerKey, "list", { kind: "procedure" });
    expect((procedures.body.items as Page[]).map(({ id }) => id)).toEqual([escalation.id]);

    const searched = await call(searchPages, managerKey, "search", { query: "rest unique voice phrase" });
    expect(searched.status).toBe(200);
    expect(searched.body.items).toContainEqual(expect.objectContaining({ id: voice.id, title: "REST voice" }));

    const read = await call(readPage, managerKey, "read", { id: voice.id });
    expect(read.status).toBe(200);
    expect(read.body).toMatchObject({ id: voice.id, markdown: "Use plain words. rest-unique-voice-phrase" });

    const updated = await call(updatePage, managerKey, "update", {
      id: voice.id,
      expectedUpdatedAt: read.body.updatedAt,
      title: "REST company voice",
    });
    expect(updated.status, JSON.stringify(updated.body)).toBe(200);
    expect(updated.body).toMatchObject({ id: voice.id, title: "REST company voice" });

    const stale = await call(updatePage, managerKey, "update", {
      id: voice.id,
      expectedUpdatedAt: read.body.updatedAt,
      title: "Lost update",
    });
    expect(stale.status).toBe(409);
    expect(stale.body).toMatchObject({ error: { kind: "conflict", issues: [{ customCode: "wikiPageConflict" }] } });

    const moved = await call(movePage, managerKey, "move", {
      id: escalation.id,
      targetId: readablePageId,
      placement: "before",
    });
    expect(moved).toEqual({ status: 200, body: true });
    const reordered = await call(listPages, managerKey, "list", { pageSize: 25 });
    const order = (reordered.body.items as Page[]).map(({ id }) => id);
    expect(order.indexOf(escalation.id)).toBe(order.indexOf(readablePageId) - 1);

    const deleted = await call(deletePage, managerKey, "delete", {
      id: voice.id,
      expectedUpdatedAt: updated.body.updatedAt,
    });
    expect(deleted.status).toBe(200);
    expect(deleted.body).toMatchObject({ id: voice.id, trashBatchId: expect.any(String) as string });
    const trash = await client.query(
      'SELECT "kind", "targetId" FROM "TrashItem" WHERE "companyId" = $1 AND "batchId" = $2',
      [companyId, deleted.body.trashBatchId],
    );
    expect(trash.rows).toEqual([{ kind: "wikiPage", targetId: voice.id }]);
    expect((await call(readPage, managerKey, "read", { id: voice.id })).status).toBe(404);
  }, 30_000);

  it("never reads, finds or changes another workspace's page", async () => {
    const read = await call(readPage, managerKey, "read", { id: foreignPageId });
    expect(read.status).toBe(404);
    expect(read.body).toMatchObject({ error: { kind: "not_found", issues: [{ customCode: "wikiPageNotFound" }] } });

    const searched = await call(searchPages, managerKey, "search", { query: "rest foreign tenant phrase" });
    expect(JSON.stringify(searched.body)).not.toContain(foreignPageId);

    const expectedUpdatedAt = new Date().toISOString();
    const updated = await call(updatePage, managerKey, "update", {
      id: foreignPageId,
      expectedUpdatedAt,
      title: "Taken over",
    });
    expect(updated.status).toBe(404);
    const deleted = await call(deletePage, managerKey, "delete", { id: foreignPageId, expectedUpdatedAt });
    expect(deleted.status).toBe(404);
    const moved = await call(movePage, managerKey, "move", {
      id: foreignPageId,
      targetId: readablePageId,
      placement: "after",
    });
    expect(moved.status).toBe(404);

    const foreign = await client.query('SELECT "title", "deletedAt" FROM "WikiPage" WHERE "id" = $1', [foreignPageId]);
    expect(foreign.rows).toEqual([{ title: "Foreign confidential page", deletedAt: null }]);
  });

  it("lets a Knowledge Base Read key read but refuses every mutation", async () => {
    const read = await call(readPage, readerKey, "read", { id: readablePageId });
    expect(read.status).toBe(200);
    const searched = await call(searchPages, readerKey, "search", { query: "rest reader discovery phrase" });
    expect(searched.body.items).toContainEqual(expect.objectContaining({ id: readablePageId }));

    const expectedUpdatedAt = read.body.updatedAt;
    const attempts = [
      await call(createPages, readerKey, "create", { pages: [{ title: "Denied", markdown: "No." }] }),
      await call(updatePage, readerKey, "update", { id: readablePageId, expectedUpdatedAt, title: "Denied" }),
      await call(movePage, readerKey, "move", { id: readablePageId, targetId: readablePageId, placement: "after" }),
      await call(deletePage, readerKey, "delete", { id: readablePageId, expectedUpdatedAt }),
    ];
    for (const attempt of attempts) {
      expect(attempt.status).toBe(403);
      expect(attempt.body).toMatchObject({ error: { kind: "authorization" } });
    }

    const rows = await client.query(
      'SELECT "title", "deletedAt" FROM "WikiPage" WHERE "companyId" = $1 AND ("id" = $2 OR "title" = \'Denied\')',
      [companyId, readablePageId],
    );
    expect(rows.rows).toEqual([{ title: "Readable REST fixture", deletedAt: null }]);
  });
});
