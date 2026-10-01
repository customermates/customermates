import { createHash } from "node:crypto";
import type { ClientBase } from "pg";
import { z } from "zod";
import { installLegacyFingerprint, legacySourceFingerprint } from "../v8/fingerprint";

const Manifest = z
  .object({
    previousSourceHashes: z.tuple([z.string(), z.string(), z.string()]),
    schemaRevision: z.literal(3),
    storageMode: z.literal("generic"),
    legacySourceHash: z.string().optional(),
  })
  .strict();

type Checkpoint = { version: number; sourceHash: string; manifest: unknown };

function finalHash(manifest: z.infer<typeof Manifest>) {
  return createHash("sha256").update(JSON.stringify(manifest)).digest("hex");
}

async function checkpoints(client: ClientBase, companyId: string) {
  const rows = await client.query<Checkpoint>(
    'SELECT version, "sourceHash", manifest FROM "RecordMigrationCheckpoint" WHERE "companyId" = $1 AND version IN (4, 5, 6, 7) ORDER BY version',
    [companyId],
  );
  return new Map(rows.rows.map((row) => [row.version, row]));
}

export async function readFinalizedRecordWorkspace(client: ClientBase, companyId: string) {
  const state = (
    await client.query<{ revision: number; storageMode: string }>(
      'SELECT revision, "storageMode" FROM "RecordSchemaState" WHERE "companyId" = $1',
      [companyId],
    )
  ).rows[0];
  const saved = await checkpoints(client, companyId);
  const final = saved.get(7);
  if (!final) {
    if (state?.storageMode === "generic" && [4, 5, 6].some((version) => saved.has(version)))
      throw new Error("A migrated workspace is generic without a finalization checkpoint");
    return state?.storageMode === "generic" ? "new" : null;
  }
  const manifest = Manifest.parse(final.manifest);
  if (
    !state ||
    state.storageMode !== "generic" ||
    state.revision < manifest.schemaRevision ||
    final.sourceHash !== finalHash(manifest) ||
    [4, 5, 6].some((version, index) => saved.get(version)?.sourceHash !== manifest.previousSourceHashes[index])
  )
    throw new Error("Finalized record migration checkpoint is inconsistent");
  return "upgraded";
}

export async function withRecordWorkspaceSessionLock<T>(
  client: ClientBase,
  companyId: string,
  work: () => Promise<T>,
): Promise<T> {
  await client.query("SELECT pg_advisory_lock(hashtextextended($1, 0))", [companyId]);
  try {
    return await work();
  } finally {
    await client.query("SELECT pg_advisory_unlock(hashtextextended($1, 0))", [companyId]);
  }
}

export async function finalizeReconciledRecordWorkspace(client: ClientBase, companyId: string) {
  await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
  try {
    const prior = await readFinalizedRecordWorkspace(client, companyId);
    if (prior) {
      await client.query("ROLLBACK");
      return { ok: true, companyId, version: 7, alreadyGeneric: true, origin: prior };
    }
    const state = (
      await client.query<{ revision: number; storageMode: string; activeOperationId: string | null }>(
        'SELECT revision, "storageMode", "activeOperationId" FROM "RecordSchemaState" WHERE "companyId" = $1 FOR UPDATE',
        [companyId],
      )
    ).rows[0];
    if (!state || state.storageMode !== "backfilled" || state.revision !== 3 || state.activeOperationId)
      throw new Error("Finalization requires a fully backfilled, unchanged, idle record model");
    const saved = await checkpoints(client, companyId);
    if (![4, 5, 6].every((version) => saved.has(version)))
      throw new Error("Finalization requires record, presentation and trigger migration checkpoints");
    const active = await client.query(
      "SELECT 1 FROM \"RecordOperation\" WHERE \"companyId\" = $1 AND state IN ('pending', 'staging') LIMIT 1",
      [companyId],
    );
    if (active.rowCount) throw new Error("Finalization requires all record operations to settle");
    await installLegacyFingerprint(client);
    const manifest = Manifest.parse({
      previousSourceHashes: [4, 5, 6].map((version) => saved.get(version)?.sourceHash),
      schemaRevision: 3,
      storageMode: "generic",
      legacySourceHash: await legacySourceFingerprint(client, companyId),
    });
    const changed = await client.query(
      'UPDATE "RecordSchemaState" SET "storageMode" = $2 WHERE "companyId" = $1 AND revision = 3 AND "storageMode" = $3 AND "activeOperationId" IS NULL',
      [companyId, "generic", "backfilled"],
    );
    if (changed.rowCount !== 1) throw new Error("Record migration state changed during finalization");
    await client.query(
      'INSERT INTO "RecordMigrationCheckpoint" ("companyId", version, "sourceHash", manifest) VALUES ($1, 7, $2, $3::jsonb)',
      [companyId, finalHash(manifest), JSON.stringify(manifest)],
    );
    await client.query("COMMIT");
    return { ok: true, companyId, version: 7, alreadyGeneric: false, origin: "upgraded" as const };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
