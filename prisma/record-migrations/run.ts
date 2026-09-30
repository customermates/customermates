import type { ClientBase } from "pg";
import { migrateLegacyWorkspace } from "./v2/run";
import { migrateParticipantLookups } from "./v3/participant-identities";
import { migrateRecordActivityState } from "./v4/run";
import { migrateRecordPresentation } from "./v5/run";
import { migrateRecordTriggers } from "./v6/run";
import { readFinalizedRecordWorkspace } from "./v7/finalize";

export async function migrateRecordWorkspace(
  client: ClientBase,
  companyId: string,
  mode: "preflight" | "backfill" | "reconcile",
  throughVersion: 4 | 5 | 6 = 5,
) {
  const finalized = await readFinalizedRecordWorkspace(client, companyId);
  if (finalized) {
    return {
      ok: true,
      companyId,
      records: null,
      participants: null,
      activities: null,
      presentation: null,
      triggers: null,
      finalized,
    };
  }
  const applied = (
    await client.query<{ version: number }>(
      'SELECT version FROM "RecordMigrationCheckpoint" WHERE "companyId" = $1 AND version IN (4, 5)',
      [companyId],
    )
  ).rows.map((row) => row.version);
  const records = applied.includes(4) ? null : await migrateLegacyWorkspace(client, companyId, mode);
  if (records && !records.ok)
    return { ok: false, companyId, records, participants: null, activities: null, presentation: null };
  const participants = await migrateParticipantLookups(client, companyId, mode);
  const activities =
    participants.ok && !applied.includes(5) ? await migrateRecordActivityState(client, companyId, mode) : null;
  const previousOk = participants.ok && (activities?.ok === true || applied.includes(5));
  const presentation =
    previousOk && throughVersion >= 5 ? await migrateRecordPresentation(client, companyId, mode) : null;
  const triggers =
    presentation?.ok && throughVersion === 6 ? await migrateRecordTriggers(client, companyId, mode) : null;
  return {
    ok:
      previousOk &&
      (throughVersion === 4 || (presentation?.ok === true && (throughVersion === 5 || triggers?.ok === true))),
    companyId,
    records,
    participants,
    activities,
    presentation,
    triggers,
  };
}
