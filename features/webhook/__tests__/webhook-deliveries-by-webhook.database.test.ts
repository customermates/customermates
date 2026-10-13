import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getGetWebhookDeliveriesByWebhookInteractor } from "@/core/di";
import { runWithTenant } from "@/core/decorators/tenant-context";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { interactorFailureCodes, interactorFailureKind } from "@/core/validation/validation.utils";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUser } from "@/tests/helpers/mock-user";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase("webhook deliveries by webhook on PostgreSQL", () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const companyId = randomUUID();
  const foreignCompanyId = randomUUID();
  const webhookId = randomUUID();
  const foreignWebhookId = randomUUID();
  const deliveryId = randomUUID();
  const user = createMockUser({ id: randomUUID(), companyId });

  const list = (id: string) =>
    runWithTenant(user, () => getGetWebhookDeliveriesByWebhookInteractor().invoke({ webhookId: id }));

  beforeAll(async () => {
    await client.connect();
    await client.query(
      'INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, CURRENT_TIMESTAMP), ($2, CURRENT_TIMESTAMP)',
      [companyId, foreignCompanyId],
    );
    await client.query(
      `INSERT INTO "Webhook" ("id", "url", "events", "companyId", "updatedAt") VALUES
         ($1, 'https://hooks.example.com/own', ARRAY['record.created'], $2, CURRENT_TIMESTAMP),
         ($3, 'https://hooks.example.com/foreign', ARRAY['record.created'], $4, CURRENT_TIMESTAMP)`,
      [webhookId, companyId, foreignWebhookId, foreignCompanyId],
    );
    await client.query(
      `INSERT INTO "WebhookDelivery" ("id", "url", "companyId", "event", "requestBody", "webhookId") VALUES
         ($1, 'https://hooks.example.com/own', $2, 'record.created', '{}'::jsonb, $3),
         ($4, 'https://hooks.example.com/foreign', $5, 'record.created', '{}'::jsonb, $6)`,
      [deliveryId, companyId, webhookId, randomUUID(), foreignCompanyId, foreignWebhookId],
    );
  });

  afterAll(async () => {
    await client.query('DELETE FROM "WebhookDelivery" WHERE "companyId" = ANY($1::text[])', [
      [companyId, foreignCompanyId],
    ]);
    await client.query('DELETE FROM "Company" WHERE "id" = ANY($1::text[])', [[companyId, foreignCompanyId]]);
    await client.end();
  });

  it("lists the deliveries of a webhook in the workspace", async () => {
    const result = await list(webhookId);

    expect(result.ok && result.data.items.map(({ id }) => id)).toEqual([deliveryId]);
  });

  it.each([
    ["unknown", randomUUID()],
    ["foreign", foreignWebhookId],
  ])("answers not found for an %s webhook id", async (_, id) => {
    const result = await list(id);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(interactorFailureKind(result.error)).toBe("not_found");
    expect(interactorFailureCodes(result.error)).toEqual([CustomErrorCode.webhookNotFound]);
    expect(result.error.issues[0].path).toEqual(["webhookId"]);
  });
});
