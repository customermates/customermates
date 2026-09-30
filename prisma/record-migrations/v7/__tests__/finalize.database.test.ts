import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, describe, expect, it } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { migrateRecordWorkspace } from "../../run";
import { presentationFixture } from "../../v5/__tests__/fixture";
import {
  finalizeReconciledRecordWorkspace,
  readFinalizedRecordWorkspace,
  withRecordWorkspaceSessionLock,
} from "../finalize";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;
const companies: string[] = [];
const clients: Client[] = [];

async function fixture() {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  await client.connect();
  clients.push(client);
  const data = await presentationFixture(client, 60, (companyId) => companies.push(companyId));
  expect(await migrateRecordWorkspace(client, data.companyId, "backfill", 6)).toMatchObject({ ok: true });
  return data;
}

describeDatabase("record migration finalization", { timeout: 90000 }, () => {
  afterAll(async () => {
    if (clients[0]) await clients[0].query('DELETE FROM "Company" WHERE id = ANY($1::text[])', [companies]);
    for (const client of clients) await client.end();
  });

  it("reconciles under the workspace lock, switches atomically and permits idempotent recovery", async () => {
    const data = await fixture();
    const second = new Client({ connectionString: databaseUrl ?? undefined });
    await second.connect();
    try {
      await withRecordWorkspaceSessionLock(data.client, data.companyId, async () => {
        await second.query("BEGIN");
        await second.query("SET LOCAL lock_timeout = '100ms'");
        await expect(
          second.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [data.companyId]),
        ).rejects.toMatchObject({ code: "55P03" });
        await second.query("ROLLBACK");
        expect(await migrateRecordWorkspace(data.client, data.companyId, "reconcile", 6)).toMatchObject({ ok: true });
        expect(await finalizeReconciledRecordWorkspace(data.client, data.companyId)).toMatchObject({
          ok: true,
          alreadyGeneric: false,
        });
      });
      expect(await readFinalizedRecordWorkspace(data.client, data.companyId)).toBe("upgraded");
      expect(await migrateRecordWorkspace(data.client, data.companyId, "reconcile", 6)).toMatchObject({
        ok: true,
        finalized: "upgraded",
      });
      expect(await finalizeReconciledRecordWorkspace(data.client, data.companyId)).toMatchObject({
        ok: true,
        alreadyGeneric: true,
      });
      const state = await data.client.query(
        'SELECT "storageMode", revision FROM "RecordSchemaState" WHERE "companyId" = $1',
        [data.companyId],
      );
      expect(state.rows[0]).toEqual({ storageMode: "generic", revision: 3 });
      const checkpoints = await data.client.query(
        'SELECT version FROM "RecordMigrationCheckpoint" WHERE "companyId" = $1 AND version = 7',
        [data.companyId],
      );
      expect(checkpoints.rows).toHaveLength(1);
    } finally {
      await second.end();
    }
  });

  it("refuses an active operation and an uncheckpointed state flip", async () => {
    const data = await fixture();
    await data.client.query('UPDATE "RecordSchemaState" SET "activeOperationId" = $2 WHERE "companyId" = $1', [
      data.companyId,
      randomUUID(),
    ]);
    await expect(finalizeReconciledRecordWorkspace(data.client, data.companyId)).rejects.toThrow("idle record model");
    await data.client.query(
      'UPDATE "RecordSchemaState" SET "activeOperationId" = NULL, "storageMode" = $2 WHERE "companyId" = $1',
      [data.companyId, "generic"],
    );
    await expect(readFinalizedRecordWorkspace(data.client, data.companyId)).rejects.toThrow(
      "without a finalization checkpoint",
    );
  });
});
