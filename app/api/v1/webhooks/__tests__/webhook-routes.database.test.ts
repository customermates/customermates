import { randomUUID } from "node:crypto";

import { NextRequest } from "next/server";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createApiKeyTenant } from "@/tests/helpers/api-key-tenant-fixture";
import { assertPublishedResponse } from "@/tests/helpers/openapi-validator";

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

import { GET as listWebhooks, POST as createWebhook } from "../route";
import { DELETE as deleteWebhook, GET as readWebhook, PATCH as updateWebhook } from "../[id]/route";
import { GET as listDeliveries } from "../[id]/deliveries/route";
import { GET as listWorkspaceDeliveries } from "../deliveries/route";
import { POST as resendDelivery } from "../[id]/deliveries/[deliveryId]/resend/route";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

function request(path: string, method: string, apiKey: string, body?: unknown) {
  const headers = new Headers({ "content-type": "application/json", "x-api-key": apiKey });
  requestContext.headers = headers;
  return new NextRequest(`http://localhost:4105/api/v1/webhooks${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function read(response: Response) {
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

describeDatabase("webhook REST routes over API keys", () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const ownWebhookId = randomUUID();
  const siblingWebhookId = randomUUID();
  const foreignWebhookId = randomUUID();
  const ownDeliveryId = randomUUID();
  const foreignDeliveryId = randomUUID();
  let tenant: Awaited<ReturnType<typeof createApiKeyTenant>>;
  let foreign: Awaited<ReturnType<typeof createApiKeyTenant>>;
  let admin: { userId: string; apiKey: string };
  let outsider: { userId: string; apiKey: string };

  async function insertWebhook(id: string, companyId: string, url: string) {
    await client.query(
      `INSERT INTO "Webhook" ("id", "companyId", "url", "description", "events", "secret", "headers", "updatedAt")
       VALUES ($1, $2, $3, 'Fixture hook', ARRAY['messaging.message.received'], 'fixture-secret-value', '{"Authorization":"Bearer fixture-header-value"}'::jsonb, CURRENT_TIMESTAMP)`,
      [id, companyId, url],
    );
  }

  async function insertDelivery(id: string, companyId: string, webhookId: string, url: string) {
    await client.query(
      `INSERT INTO "WebhookDelivery" ("id", "companyId", "webhookId", "url", "event", "requestBody", "status", "success", "statusCode", "nextAttemptAt", "deliveredAt")
       VALUES ($1, $2, $3, $4, 'messaging.message.received', '{}'::jsonb, 'failed', FALSE, 500, NULL, CURRENT_TIMESTAMP)`,
      [id, companyId, webhookId, url],
    );
  }

  beforeAll(async () => {
    await client.connect();
    tenant = await createApiKeyTenant(client, [
      { label: "webhook-admin", systemRole: true },
      { label: "webhook-outsider", systemRole: false },
    ]);
    foreign = await createApiKeyTenant(client, [{ label: "webhook-foreign", systemRole: true }]);
    [admin, outsider] = tenant.members;
    await insertWebhook(ownWebhookId, tenant.companyId, "https://own.example.com/hook");
    await insertWebhook(siblingWebhookId, tenant.companyId, "https://sibling.example.com/hook");
    await insertWebhook(foreignWebhookId, foreign.companyId, "https://foreign.example.com/hook");
    await insertDelivery(ownDeliveryId, tenant.companyId, ownWebhookId, "https://own.example.com/hook");
    await insertDelivery(foreignDeliveryId, foreign.companyId, foreignWebhookId, "https://foreign.example.com/hook");
  });

  afterAll(async () => {
    await client.query('DELETE FROM "WebhookDelivery" WHERE "companyId" = ANY($1)', [
      [tenant?.companyId, foreign?.companyId].filter(Boolean),
    ]);
    await tenant?.remove();
    await foreign?.remove();
    await client.end();
  });

  it("lists only the caller's webhooks and never their secrets or header values", async () => {
    const listed = await read(await listWebhooks(request("?pageSize=25", "GET", admin.apiKey)));

    expect(listed.status).toBe(200);
    expect((listed.body.items as Array<{ id: string }>).map(({ id }) => id).sort()).toEqual(
      [ownWebhookId, siblingWebhookId].sort(),
    );
    expect(listed.body.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ hasSecret: true, headerNames: ["Authorization"] })]),
    );
    const text = JSON.stringify(listed.body);
    expect(text).not.toContain("foreign.example.com");
    expect(text).not.toContain("fixture-secret-value");
    expect(text).not.toContain("fixture-header-value");
  });

  it("reads the caller's webhook and answers 404 for an unknown or foreign id", async () => {
    const own = await read(
      await readWebhook(request(`/${ownWebhookId}`, "GET", admin.apiKey), {
        params: Promise.resolve({ id: ownWebhookId }),
      }),
    );
    expect(own.status).toBe(200);
    expect(own.body).toMatchObject({ id: ownWebhookId, hasSecret: true, headerNames: ["Authorization"] });
    expect(JSON.stringify(own.body)).not.toContain("fixture-secret-value");

    for (const id of [foreignWebhookId, randomUUID()]) {
      const missing = await read(
        await readWebhook(request(`/${id}`, "GET", admin.apiKey), { params: Promise.resolve({ id }) }),
      );
      expect(missing.status).toBe(404);
      expect(missing.body).toMatchObject({
        error: { kind: "not_found", issues: [expect.objectContaining({ customCode: "webhookNotFound" })] },
      });
      expect(JSON.stringify(missing.body)).not.toContain("foreign.example.com");
    }
  });

  it("lists one webhook's deliveries and answers 404 for another workspace's webhook", async () => {
    const own = await read(
      await listDeliveries(request(`/${ownWebhookId}/deliveries`, "GET", admin.apiKey), {
        params: Promise.resolve({ id: ownWebhookId }),
      }),
    );
    expect(own.status).toBe(200);
    expect((own.body.items as Array<{ id: string }>).map(({ id }) => id)).toEqual([ownDeliveryId]);

    const sibling = await read(
      await listDeliveries(request(`/${siblingWebhookId}/deliveries`, "GET", admin.apiKey), {
        params: Promise.resolve({ id: siblingWebhookId }),
      }),
    );
    expect(sibling.status).toBe(200);
    expect(sibling.body.items).toEqual([]);

    const foreignList = await read(
      await listDeliveries(request(`/${foreignWebhookId}/deliveries`, "GET", admin.apiKey), {
        params: Promise.resolve({ id: foreignWebhookId }),
      }),
    );
    expect(foreignList.status).toBe(404);
    expect(foreignList.body).toMatchObject({ error: { kind: "not_found" } });
  });

  it("lists deliveries across the caller's webhooks and never another workspace's", async () => {
    const listed = await read(await listWorkspaceDeliveries(request("/deliveries?pageSize=25", "GET", admin.apiKey)));

    expect(listed.status).toBe(200);
    expect((listed.body.items as Array<{ id: string }>).map(({ id }) => id)).toEqual([ownDeliveryId]);
    expect(JSON.stringify(listed.body)).not.toContain("foreign.example.com");
    assertPublishedResponse("/v1/webhooks/deliveries", "get", listed.status, listed.body);

    const foreignListed = await read(
      await listWorkspaceDeliveries(request("/deliveries", "GET", foreign.members[0].apiKey)),
    );
    expect(foreignListed.status).toBe(200);
    expect((foreignListed.body.items as Array<{ id: string }>).map(({ id }) => id)).toEqual([foreignDeliveryId]);
  });

  it("refuses to update or resend across workspaces or across webhooks", async () => {
    const foreignUpdate = await read(
      await updateWebhook(request(`/${foreignWebhookId}`, "PATCH", admin.apiKey, { description: "Hijacked" }), {
        params: Promise.resolve({ id: foreignWebhookId }),
      }),
    );
    expect(foreignUpdate.status).toBe(404);

    const foreignResend = await read(
      await resendDelivery(
        request(`/${ownWebhookId}/deliveries/${foreignDeliveryId}/resend`, "POST", admin.apiKey, {}),
        {
          params: Promise.resolve({ id: ownWebhookId, deliveryId: foreignDeliveryId }),
        },
      ),
    );
    expect(foreignResend.status).toBe(404);

    const crossWebhookResend = await read(
      await resendDelivery(
        request(`/${siblingWebhookId}/deliveries/${ownDeliveryId}/resend`, "POST", admin.apiKey, {}),
        { params: Promise.resolve({ id: siblingWebhookId, deliveryId: ownDeliveryId }) },
      ),
    );
    expect(crossWebhookResend.status).toBe(404);
    expect(crossWebhookResend.body).toMatchObject({ error: { kind: "not_found" } });

    const foreignRow = await client.query('SELECT "description" FROM "Webhook" WHERE "id" = $1', [foreignWebhookId]);
    expect(foreignRow.rows).toEqual([{ description: "Fixture hook" }]);
    const deliveries = await client.query(
      'SELECT COUNT(*)::int AS count FROM "WebhookDelivery" WHERE "companyId" = ANY($1)',
      [[tenant.companyId, foreign.companyId]],
    );
    expect(deliveries.rows).toEqual([{ count: 2 }]);
  });

  it("denies callers without API permissions", async () => {
    const listed = await read(await listWebhooks(request("", "GET", outsider.apiKey)));
    expect(listed.status).toBe(403);
    expect(listed.body).toMatchObject({ error: { kind: "authorization" } });

    const patched = await read(
      await updateWebhook(request(`/${ownWebhookId}`, "PATCH", outsider.apiKey, { enabled: false }), {
        params: Promise.resolve({ id: ownWebhookId }),
      }),
    );
    expect(patched.status).toBe(403);

    const deliveries = await read(
      await listDeliveries(request(`/${ownWebhookId}/deliveries`, "GET", outsider.apiKey), {
        params: Promise.resolve({ id: ownWebhookId }),
      }),
    );
    expect(deliveries.status).toBe(403);

    const workspaceDeliveries = await read(
      await listWorkspaceDeliveries(request("/deliveries", "GET", outsider.apiKey)),
    );
    expect(workspaceDeliveries.status).toBe(403);
    expect(workspaceDeliveries.body).toMatchObject({ error: { kind: "authorization" } });
    assertPublishedResponse("/v1/webhooks/deliveries", "get", workspaceDeliveries.status, workspaceDeliveries.body);

    const row = await client.query('SELECT "enabled" FROM "Webhook" WHERE "id" = $1', [ownWebhookId]);
    expect(row.rows).toEqual([{ enabled: true }]);
  });

  it("updates only the supplied fields of the caller's webhook", async () => {
    const patched = await read(
      await updateWebhook(request(`/${ownWebhookId}`, "PATCH", admin.apiKey, { description: "Renamed hook" }), {
        params: Promise.resolve({ id: ownWebhookId }),
      }),
    );

    expect(patched.status).toBe(200);
    expect(patched.body).toMatchObject({
      id: ownWebhookId,
      description: "Renamed hook",
      url: "https://own.example.com/hook",
      events: ["messaging.message.received"],
      hasSecret: true,
      headerNames: ["Authorization"],
    });
    expect(JSON.stringify(patched.body)).not.toContain("fixture-secret-value");
  });

  it.each([
    ["https://bücher.example/hook", "https://xn--bcher-kva.example/hook"],
    ["https://example.com/über", "https://example.com/%C3%BCber"],
  ])("stores an international URL as a schema-valid URI", async (url, canonical) => {
    const created = await read(
      await createWebhook(
        request("", "POST", admin.apiKey, {
          url,
          events: ["messaging.message.received"],
          enabled: false,
        }),
      ),
    );
    expect(created.status).toBe(201);
    expect(created.body.url).toBe(canonical);
    assertPublishedResponse("/v1/webhooks", "post", created.status, created.body);
    const id = created.body.id as string;
    try {
      expect((await client.query('SELECT "url" FROM "Webhook" WHERE "id" = $1', [id])).rows).toEqual([
        { url: canonical },
      ]);
      const fetched = await read(
        await readWebhook(request(`/${id}`, "GET", admin.apiKey), {
          params: Promise.resolve({ id }),
        }),
      );
      expect(fetched.body.url).toBe(canonical);
      assertPublishedResponse("/v1/webhooks/{id}", "get", fetched.status, fetched.body);
    } finally {
      await deleteWebhook(request(`/${id}`, "DELETE", admin.apiKey), {
        params: Promise.resolve({ id }),
      });
    }
  });
});
