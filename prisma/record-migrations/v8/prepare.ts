import type { ClientBase } from "pg";
import { migrateLegacyTerminology } from "./terminology";
import { migrateTimelineViewReferences } from "./timeline-views";
import { LEGACY_CRM_TABLES } from "./tables";
import { readFinalizedRecordWorkspace } from "../v7/finalize";
import { readLegacyModel } from "../v2/legacy-model";
import { reconcileMigratedRecords } from "../v2/reconcile";
import { installLegacyFingerprint, legacySourceFingerprint } from "./fingerprint";

/** Produces the required drop receipt under locks; never drops data or publishes a partial upgrade. */
export async function prepareLegacyContraction(client: ClientBase) {
  await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
  try {
    await client.query("SET LOCAL TIME ZONE 'UTC'");
    const present = await client.query<{ name: string; present: boolean }>(
      "SELECT name, to_regclass(format('%I', name)) IS NOT NULL AS present FROM unnest($1::text[]) name",
      [LEGACY_CRM_TABLES],
    );
    if (present.rows.every((row) => !row.present)) {
      await client.query("ROLLBACK");
      return { ok: true, alreadyContracted: true, workspaces: 0 };
    }
    if (present.rows.some((row) => !row.present))
      throw new Error("Legacy storage is partially removed; restore the matching database baseline");
    const companies = await client.query<{ id: string }>('SELECT id FROM "Company" ORDER BY id');
    for (const company of companies.rows)
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [company.id]);
    await client.query(`LOCK TABLE ${LEGACY_CRM_TABLES.map((table) => `"${table}"`).join(", ")} IN EXCLUSIVE MODE`);
    await client.query(
      'LOCK TABLE "Company", "RecordSchemaState", "RecordOperation", "RecordMigrationCheckpoint", "Widget", "DataView", "P13n", "Routine", "Webhook", "RecordEventSubscription" IN SHARE ROW EXCLUSIVE MODE',
    );
    await installLegacyFingerprint(client);
    for (const company of companies.rows) {
      const origin = await readFinalizedRecordWorkspace(client, company.id);
      if (!origin) throw new Error("Contraction requires every workspace to finish the reconciled generic upgrade");
      const state = (
        await client.query<{ revision: number; activeOperationId: string | null }>(
          'SELECT revision, "activeOperationId" FROM "RecordSchemaState" WHERE "companyId"=$1',
          [company.id],
        )
      ).rows[0];
      if (
        !state ||
        state.activeOperationId ||
        (
          await client.query(
            "SELECT 1 FROM \"RecordOperation\" WHERE \"companyId\"=$1 AND state IN ('pending', 'staging') LIMIT 1",
            [company.id],
          )
        ).rowCount
      )
        throw new Error("Contraction requires settled CRM operations");
      const fingerprint = await legacySourceFingerprint(client, company.id);
      const final = (
        await client.query<{ sourceHash: string; manifest: { legacySourceHash?: string } }>(
          'SELECT "sourceHash", manifest FROM "RecordMigrationCheckpoint" WHERE "companyId"=$1 AND version=7',
          [company.id],
        )
      ).rows[0];
      if (origin === "upgraded") {
        if (final?.manifest.legacySourceHash) {
          if (final.manifest.legacySourceHash !== fingerprint)
            throw new Error("Legacy source changed after reconciled finalization");
        } else {
          // Earlier local v7 checkpoints lacked a full source fingerprint. Only an unchanged,
          // independently reconciled baseline may be adopted; a configured baseline must be restored.
          const source = await readLegacyModel(client, company.id);
          const reconciliation = await reconcileMigratedRecords(client, source);
          if (!reconciliation.valid) {
            throw new Error(
              "Earlier finalization has no full source fingerprint and cannot reconcile; restore and migrate the baseline",
            );
          }
        }
      } else {
        for (const table of LEGACY_CRM_TABLES) {
          if ((await client.query(`SELECT 1 FROM "${table}" WHERE "companyId"=$1 LIMIT 1`, [company.id])).rowCount)
            throw new Error("A new generic workspace contains unaccounted legacy records");
        }
      }

      await migrateTimelineViewReferences(client, company.id);
      const recordRevision = await migrateLegacyTerminology(client, company.id, state.revision);
      const manifest = { storageMode: "generic", recordRevision, origin, finalizationHash: final?.sourceHash ?? null };
      await client.query(
        'INSERT INTO "RecordMigrationCheckpoint" ("companyId", version, "sourceHash", manifest) VALUES ($1,8,$2,$3::jsonb) ON CONFLICT ("companyId",version) DO UPDATE SET "sourceHash"=EXCLUDED."sourceHash", manifest=EXCLUDED.manifest, "completedAt"=NOW()',
        [company.id, fingerprint, JSON.stringify(manifest)],
      );
    }
    await client.query("COMMIT");
    return { ok: true, alreadyContracted: false, workspaces: companies.rows.length };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
