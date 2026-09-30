import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { migrateRecordWorkspace } from "../../run";
import { migrateRecordTriggers } from "../run";
import { presentationFixture } from "../../v5/__tests__/fixture";
import { RecordEventSubscriptionSchema } from "@/features/records/record-event-subscription.schema";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;
const companies: string[] = [];
const clients: Client[] = [];

async function fixture() {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  await client.connect();
  clients.push(client);
  const f = await presentationFixture(client, 60, (companyId) => companies.push(companyId));
  expect(await migrateRecordWorkspace(client, f.companyId, "backfill", 5)).toMatchObject({ ok: true });
  return f;
}

describeDatabase("legacy record trigger migration", { timeout: 60000 }, () => {
  afterAll(async () => {
    if (clients[0]) await clients[0].query('DELETE FROM "Company" WHERE id = ANY($1::text[])', [companies]);
    for (const client of clients) await client.end();
  });

  it("keeps one webhook and routine identity while converting several watched record types", async () => {
    const f = await fixture();
    const webhookId = await f.insert("Webhook", {
      url: "https://receiver.example.test/legacy",
      events: ["contact.created", "deal.updated", "organization.updated", "messaging.message.received"],
    });
    await f.client.query(
      'INSERT INTO "AuditLog" (id, "companyId", "userId", "entityId", event, "eventData") VALUES ($1, $2, $3, $4, $5, $6::jsonb)',
      [randomUUID(), f.companyId, f.userId, webhookId, "webhook.created", "{}"],
    );
    const routineId = await f.insert("Routine", {
      ownerUserId: f.userId,
      name: "Catalog and pipeline",
      prompt: "Inspect changes.",
      triggerKind: "event",
      triggerEvents: ["service.updated", "deal.updated"],
      changedFields: [],
      triggerFilters: "[]",
    });
    expect(await migrateRecordTriggers(f.client, f.companyId, "preflight")).toMatchObject({
      ok: true,
      triggers: 2,
    });
    expect(await migrateRecordTriggers(f.client, f.companyId, "backfill")).toMatchObject({
      ok: true,
      resumed: false,
      triggers: 2,
    });
    expect(await migrateRecordTriggers(f.client, f.companyId, "reconcile")).toMatchObject({
      ok: true,
      resumed: true,
      triggers: 2,
    });
    const webhook = await f.client.query('SELECT events FROM "Webhook" WHERE "companyId" = $1 AND id = $2', [
      f.companyId,
      webhookId,
    ]);
    expect(webhook.rows[0].events).toEqual(["messaging.message.received", "record.created", "record.updated"]);
    const routine = await f.client.query('SELECT "triggerEvents" FROM "Routine" WHERE "companyId" = $1 AND id = $2', [
      f.companyId,
      routineId,
    ]);
    expect(routine.rows[0].triggerEvents).toEqual(["record.updated"]);
    const subscriptions = await f.client.query(
      'SELECT id, "ownerUserId", events, sources FROM "RecordEventSubscription" WHERE "companyId" = $1 ORDER BY id',
      [f.companyId],
    );
    expect(subscriptions.rows).toHaveLength(2);
    expect(subscriptions.rows.map((row) => row.id).sort()).toEqual([webhookId, routineId].sort());
    expect(subscriptions.rows.every((row) => row.ownerUserId === f.userId)).toBe(true);
    for (const row of subscriptions.rows) {
      const stored = await f.client.query(
        'SELECT id, kind, "ownerUserId", "typeId", events, "changedFieldIds", query, sources, revision, enabled FROM "RecordEventSubscription" WHERE "companyId" = $1 AND id = $2',
        [f.companyId, row.id],
      );
      expect(RecordEventSubscriptionSchema.safeParse(stored.rows[0]).success).toBe(true);
    }
    expect(subscriptions.rows.find((row) => row.id === webhookId)?.sources).toMatchObject([
      { query: { typeId: f.id("contact") }, events: ["record.created"] },
      { query: { typeId: f.id("deal") }, events: ["record.updated"] },
      { query: { typeId: f.id("organization") }, events: ["record.updated"] },
    ]);
    expect(subscriptions.rows.find((row) => row.id === routineId)?.sources).toHaveLength(2);
  });

  it("blocks a legacy webhook whose owner cannot be proven from audit history", async () => {
    const f = await fixture();
    await f.insert("Webhook", { url: "https://receiver.example.test/unknown", events: ["contact.created"] });
    const preflight = await migrateRecordTriggers(f.client, f.companyId, "preflight");
    expect(preflight).toMatchObject({ ok: false, issues: [{ code: "unresolved_trigger_owner" }] });
    expect(
      (
        await f.client.query(
          'SELECT COUNT(*) FROM "RecordMigrationCheckpoint" WHERE "companyId" = $1 AND version = 6',
          [f.companyId],
        )
      ).rows[0].count,
    ).toBe("0");
  });
});
