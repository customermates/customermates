import type { ClientBase } from "pg";
import { z } from "zod";
import { presetId } from "../v2/contract/crm-preset";
import catalog from "./terminology-labels.json" with { type: "json" };

const Labels = z.object({ singular: z.string().min(1), plural: z.string().min(1) }).strict();
const Catalog = z.record(z.string(), z.record(z.string(), z.record(z.string(), Labels))).parse(catalog);
const Entry = z.object({
  id: z.string(),
  entityType: z.enum(["contact", "organization", "deal", "service", "task"]),
  presetKey: z.string(),
});
const Type = z.object({ id: z.string(), label: z.string(), pluralLabel: z.string() }).passthrough();
const Snapshot = z.object({ revision: z.number().int(), types: z.array(Type) }).passthrough();

export async function migrateLegacyTerminology(client: ClientBase, companyId: string, revision: number) {
  const entries = z
    .array(Entry)
    .parse(
      (
        await client.query(
          'SELECT id, "entityType", "presetKey" FROM "EntityTerminology" WHERE "companyId"=$1 ORDER BY id',
          [companyId],
        )
      ).rows,
    );
  if (!entries.length) return revision;
  const locale =
    (
      await client.query<{ locale: string }>(
        'SELECT "displayLanguage" AS locale FROM "User" WHERE "companyId"=$1 ORDER BY "createdAt", id LIMIT 1',
        [companyId],
      )
    ).rows[0]?.locale ?? "en";
  const messages = Catalog[locale] ?? Catalog.en;
  const saved = (
    await client.query<{ snapshot: unknown }>(
      'SELECT snapshot FROM "RecordSchemaRevision" WHERE "companyId"=$1 AND revision=$2',
      [companyId, revision],
    )
  ).rows[0];
  if (!saved) throw new Error(`Missing record schema revision for terminology migration: ${companyId}`);
  const snapshot = Snapshot.parse(saved.snapshot);
  let changed = false;
  for (const entry of entries) {
    const labels = messages[entry.entityType]?.[entry.presetKey];
    if (!labels) throw new Error(`Unsupported legacy terminology: EntityTerminology:${entry.id}:presetKey`);
    const type = snapshot.types.find((type) => type.id === presetId(companyId, entry.entityType));
    if (!type) throw new Error(`Missing migrated terminology type: EntityTerminology:${entry.id}`);
    const defaults = [Catalog.en[entry.entityType][entry.entityType], messages[entry.entityType][entry.entityType]];
    if (!defaults.some((label) => type.label === label.singular && type.pluralLabel === label.plural)) continue;
    if (type.label === labels.singular && type.pluralLabel === labels.plural) continue;
    type.label = labels.singular;
    type.pluralLabel = labels.plural;
    const result = await client.query(
      'UPDATE "RecordTypeDefinition" SET label=$3, "pluralLabel"=$4, definition=$5::jsonb, "updatedAt"=NOW() WHERE "companyId"=$1 AND id=$2',
      [companyId, type.id, type.label, type.pluralLabel, JSON.stringify(type)],
    );
    if (result.rowCount !== 1) throw new Error(`Missing terminology definition: ${type.id}`);
    changed = true;
  }
  if (!changed) return revision;
  snapshot.revision = revision + 1;
  await client.query(
    'INSERT INTO "RecordSchemaRevision" ("companyId", revision, "actorId", snapshot) VALUES ($1,$2,$3,$4::jsonb)',
    [companyId, snapshot.revision, "migration:legacy-terminology", JSON.stringify(snapshot)],
  );
  await client.query('UPDATE "RecordSchemaState" SET revision=$2 WHERE "companyId"=$1 AND revision=$3', [
    companyId,
    snapshot.revision,
    revision,
  ]);
  return snapshot.revision;
}
