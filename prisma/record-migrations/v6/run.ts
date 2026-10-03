import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { ClientBase } from "pg";
import { z } from "zod";
import { retryMigrationTransaction } from "../retry-transaction";
import { LEGACY_TYPES, readLegacyModel, type LegacyType, type MigrationIssue } from "../v2/legacy-model";
import { presetId } from "../v2/contract/crm-preset";
import { migrateColumnKey, PresentationMigrationError } from "../v5/columns";
import { migrateQueryFilter } from "../v5/filters";
import { presentationMigrationModel } from "../v5/model";

const Row = z.object({
  id: z.uuid(),
  events: z.array(z.string()),
  enabled: z.boolean(),
  ownerUserId: z.uuid().nullable(),
  triggerKind: z.string().nullable(),
  changedFields: z.array(z.string()),
  triggerFilters: z.unknown(),
});
type SourceRow = z.infer<typeof Row> & { table: "Webhook" | "Routine" };
const Change = z.object({
  table: z.enum(["Webhook", "Routine"]),
  id: z.uuid(),
  originalEvents: z.array(z.string()),
  targetEvents: z.array(z.string()),
  subscription: z.object({
    id: z.uuid(),
    kind: z.enum(["webhook", "routine"]),
    ownerUserId: z.uuid(),
    typeId: z.null(),
    events: z.array(z.enum(["record.created", "record.updated", "record.deleted"])).min(1),
    changedFieldIds: z.array(z.string()),
    query: z.null(),
    sources: z.array(z.unknown()).min(1),
    revision: z.literal(1),
    enabled: z.boolean(),
  }),
});
type Change = z.infer<typeof Change>;
const Manifest = z.object({ previousSourceHash: z.string(), rows: z.array(Change) });
type Issue = MigrationIssue;
const legacyEvent = /^(contact|organization|deal|service|task)\.(created|updated|deleted)$/;
const canonical = (input: unknown): unknown =>
  Array.isArray(input)
    ? input.map(canonical)
    : input && typeof input === "object"
      ? Object.fromEntries(
          Object.entries(input)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, value]) => [key, canonical(value)]),
        )
      : input;
const hash = (input: unknown) =>
  createHash("sha256")
    .update(JSON.stringify(canonical(input)))
    .digest("hex");

async function readRows(client: ClientBase, companyId: string): Promise<SourceRow[]> {
  const rows: SourceRow[] = [];
  for (const table of ["Webhook", "Routine"] as const) {
    const data = await client.query(
      table === "Webhook"
        ? 'SELECT id, events, enabled, NULL::text AS "ownerUserId", NULL::text AS "triggerKind", ARRAY[]::text[] AS "changedFields", NULL::jsonb AS "triggerFilters" FROM "Webhook" WHERE "companyId" = $1 ORDER BY id'
        : 'SELECT id, "triggerEvents" AS events, enabled, "ownerUserId", "triggerKind"::text AS "triggerKind", "changedFields", "triggerFilters" FROM "Routine" WHERE "companyId" = $1 ORDER BY id',
      [companyId],
    );
    for (const item of data.rows) {
      const row = Row.parse(item);
      if (row.events.some((event) => legacyEvent.test(event))) rows.push({ ...row, table });
    }
  }
  return rows;
}

async function ownerForWebhook(client: ClientBase, companyId: string, id: string): Promise<string | null> {
  const rows = await client.query<{ userId: string }>(
    'SELECT DISTINCT audit."userId" FROM "AuditLog" audit JOIN "User" owner ON owner.id = audit."userId" AND owner."companyId" = audit."companyId" WHERE audit."companyId" = $1 AND audit."entityId" = $2 AND audit.event = $3',
    [companyId, id, "webhook.created"],
  );
  return rows.rows.length === 1 ? rows.rows[0].userId : null;
}

async function convert(
  client: ClientBase,
  companyId: string,
  row: SourceRow,
  source: Awaited<ReturnType<typeof readLegacyModel>>,
): Promise<Change> {
  const byType = new Map<LegacyType, Set<"record.created" | "record.updated" | "record.deleted">>();
  const systemEvents: string[] = [];
  for (const event of row.events) {
    const match = legacyEvent.exec(event);
    if (match) {
      const type = z.enum(LEGACY_TYPES).parse(match[1]);
      const generic = z.enum(["record.created", "record.updated", "record.deleted"]).parse(`record.${match[2]}`);
      const events = byType.get(type) ?? new Set();
      events.add(generic);
      byType.set(type, events);
    } else systemEvents.push(event);
  }
  const model = presentationMigrationModel(source);
  const sources = [...byType].map(([kind, events]) => {
    const typeId = presetId(companyId, kind);
    const filters =
      row.table === "Routine"
        ? migrateQueryFilter(source, kind, row.triggerFilters, model)
        : {
            filters: [],
            relationships: [],
            relatedFilters: [],
          };
    const changedFieldIds =
      row.table === "Routine" ? row.changedFields.map((field) => migrateColumnKey(source, kind, field)) : [];
    for (const fieldId of changedFieldIds) {
      if (!model.fields.some((field) => field.id === fieldId && field.typeId === typeId && !field.archived))
        throw new PresentationMigrationError(fieldId, "unresolved_trigger_field");
    }
    return { query: { typeId, ...filters }, changedFieldIds, events: [...events].sort() };
  });
  const ownerUserId = row.table === "Routine" ? row.ownerUserId : await ownerForWebhook(client, companyId, row.id);
  if (!ownerUserId) throw new PresentationMigrationError("ownerUserId", "unresolved_trigger_owner");
  const owner = await client.query('SELECT id FROM "User" WHERE "companyId" = $1 AND id = $2 AND status = $3', [
    companyId,
    ownerUserId,
    "active",
  ]);
  if (owner.rowCount !== 1) throw new PresentationMigrationError("ownerUserId", "inactive_trigger_owner");
  const genericEvents = [...new Set(sources.flatMap((item) => item.events))].sort();
  return Change.parse({
    table: row.table,
    id: row.id,
    originalEvents: row.events,
    targetEvents: [...new Set([...systemEvents, ...genericEvents])],
    subscription: {
      id: row.id,
      kind: row.table === "Routine" ? "routine" : "webhook",
      ownerUserId,
      typeId: null,
      events: genericEvents,
      changedFieldIds: [],
      query: null,
      sources,
      revision: 1,
      enabled: row.enabled && (row.table !== "Routine" || row.triggerKind === "event"),
    },
  });
}

async function migrateOnce(client: ClientBase, companyId: string, mode: "preflight" | "backfill" | "reconcile") {
  await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
  try {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [companyId]);
    const predecessor = (
      await client.query<{ sourceHash: string }>(
        'SELECT "sourceHash" FROM "RecordMigrationCheckpoint" WHERE "companyId" = $1 AND version = 5',
        [companyId],
      )
    ).rows[0];
    const checkpoint = (
      await client.query<{ sourceHash: string; manifest: unknown }>(
        'SELECT "sourceHash", manifest FROM "RecordMigrationCheckpoint" WHERE "companyId" = $1 AND version = 6',
        [companyId],
      )
    ).rows[0];
    const previous = checkpoint ? Manifest.parse(checkpoint.manifest) : null;
    if (!predecessor && mode !== "preflight")
      throw new Error("Complete presentation migration before trigger migration");
    if (!previous && mode === "reconcile") throw new Error("Trigger migration has not been applied");
    const state = (
      await client.query<{ revision: number; storageMode: string; activeOperationId: string | null }>(
        'SELECT revision, "storageMode", "activeOperationId" FROM "RecordSchemaState" WHERE "companyId" = $1',
        [companyId],
      )
    ).rows[0];
    if (state && (state.revision !== 3 || state.storageMode !== "backfilled" || state.activeOperationId))
      throw new Error("Trigger migration cannot overwrite an active or configured record model");
    const rows = await readRows(client, companyId);
    const source = await readLegacyModel(client, companyId);
    const issues: Issue[] = [];
    const changes: Change[] = [];
    for (const row of rows) {
      if (row.table === "Routine" && row.triggerKind !== "event") {
        issues.push({ table: row.table, id: row.id, field: "triggerKind", code: "legacy_event_on_scheduled_routine" });
        continue;
      }
      try {
        changes.push(await convert(client, companyId, row, source));
      } catch (error) {
        if (error instanceof PresentationMigrationError)
          issues.push({ table: row.table, id: row.id, field: error.field, code: error.code });
        else if (error instanceof z.ZodError) {
          for (const issue of error.issues)
            issues.push({ table: row.table, id: row.id, field: issue.path.join("."), code: "invalid_legacy_trigger" });
        } else throw error;
      }
    }
    if (previous) {
      const expected = previous.rows.map((row) => `${row.table}:${row.id}`).sort();
      const actual = rows.map((row) => `${row.table}:${row.id}`).sort();
      if (actual.length) {
        issues.push({
          table: "RecordMigrationCheckpoint",
          id: companyId,
          field: "rows",
          code: "new_legacy_trigger_after_migration",
        });
      }
      if (
        previous.previousSourceHash !== predecessor?.sourceHash ||
        checkpoint.sourceHash !== hash({ previousSourceHash: previous.previousSourceHash, rows: previous.rows })
      ) {
        issues.push({
          table: "RecordMigrationCheckpoint",
          id: companyId,
          field: "sourceHash",
          code: "migration_source_changed",
        });
      }
      for (const item of previous.rows) {
        const events = await client.query<{ events: string[] }>(
          item.table === "Webhook"
            ? 'SELECT events FROM "Webhook" WHERE "companyId" = $1 AND id = $2'
            : 'SELECT "triggerEvents" AS events FROM "Routine" WHERE "companyId" = $1 AND id = $2',
          [companyId, item.id],
        );
        const stored = await client.query(
          'SELECT id, kind, "ownerUserId", "typeId", events, "changedFieldIds", query, sources, revision, enabled FROM "RecordEventSubscription" WHERE "companyId" = $1 AND id = $2',
          [companyId, item.id],
        );
        if (
          !isDeepStrictEqual(events.rows[0]?.events, item.targetEvents) ||
          !isDeepStrictEqual(stored.rows[0], item.subscription)
        ) {
          issues.push({
            table: item.table,
            id: item.id,
            field: "subscription",
            code: "trigger_changed_since_migration",
          });
        }
      }
      if (expected.length !== previous.rows.length) {
        issues.push({
          table: "RecordMigrationCheckpoint",
          id: companyId,
          field: "rows",
          code: "duplicate_trigger_identity",
        });
      }
    } else {
      for (const item of changes) {
        const collision = await client.query(
          'SELECT id FROM "RecordEventSubscription" WHERE "companyId" = $1 AND id = $2',
          [companyId, item.id],
        );
        if (collision.rowCount)
          issues.push({ table: "RecordEventSubscription", id: item.id, field: "id", code: "trigger_target_collision" });
      }
    }
    if (mode === "preflight" || issues.length || previous) {
      await client.query("ROLLBACK");
      return {
        version: 6,
        companyId,
        ok: issues.length === 0,
        issues,
        resumed: Boolean(previous),
        triggers: previous?.rows.length ?? changes.length,
      };
    }
    for (const item of changes) {
      await client.query(
        item.table === "Webhook"
          ? 'UPDATE "Webhook" SET events = $3 WHERE "companyId" = $1 AND id = $2'
          : 'UPDATE "Routine" SET "triggerEvents" = $3 WHERE "companyId" = $1 AND id = $2',
        [companyId, item.id, item.targetEvents],
      );
      const value = item.subscription;
      await client.query(
        'INSERT INTO "RecordEventSubscription" ("companyId", id, kind, "ownerUserId", "typeId", events, "changedFieldIds", query, sources, revision, enabled) VALUES ($1, $2, $3, $4, NULL, $5, $6, NULL, $7::jsonb, 1, $8)',
        [
          companyId,
          value.id,
          value.kind,
          value.ownerUserId,
          value.events,
          value.changedFieldIds,
          JSON.stringify(value.sources),
          value.enabled,
        ],
      );
    }
    const manifest = Manifest.parse({ previousSourceHash: predecessor?.sourceHash ?? "", rows: changes });
    const sourceHash = hash(manifest);
    await client.query(
      'INSERT INTO "RecordMigrationCheckpoint" ("companyId", version, "sourceHash", manifest) VALUES ($1, 6, $2, $3::jsonb)',
      [companyId, sourceHash, JSON.stringify(manifest)],
    );
    await client.query("COMMIT");
    return { version: 6, companyId, ok: true, issues, resumed: false, triggers: changes.length };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

export function migrateRecordTriggers(
  client: ClientBase,
  companyId: string,
  mode: "preflight" | "backfill" | "reconcile",
) {
  return retryMigrationTransaction(() => migrateOnce(client, companyId, mode));
}
