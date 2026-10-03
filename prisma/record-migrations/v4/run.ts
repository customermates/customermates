import { retryMigrationTransaction } from "../retry-transaction";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { ClientBase } from "pg";
import { z } from "zod";
import type { MigrationIssue } from "../v2/legacy-model";
import { LEGACY_TABLES, LEGACY_TYPES, readLegacyModel } from "../v2/legacy-model";
import { presetId } from "../v2/contract/crm-preset";
import { preflightLegacyRecords } from "../v2/preflight";
import { reconcileMigratedRecords } from "../v2/reconcile";
import { RecordModelSchema } from "../v2/contract/record-model.schema";
import { validateRecordModel } from "../v2/contract/record-model-validation";
import { migrateActivityQuery } from "./activity-query";
import { migratedActivityPaths } from "./activity-paths";
import { backfillCalculationProvenance, reconcileCalculationProvenance } from "./provenance";

const DisplayOptions = z.object({ showFilters: z.boolean().optional() }).strict();
const Manifest = z
  .object({
    schemaRevision: z.literal(2),
    widgetIds: z.array(z.uuid()),
    checkedValues: z.number().int(),
    dependencyCount: z.number().int(),
  })
  .strict();
const MIGRATION_ACTOR = "system:record-migration:v4";
const canonical = (input: unknown): unknown => {
  if (Array.isArray(input)) return input.map(canonical);
  if (input !== null && typeof input === "object") {
    return Object.fromEntries(
      Object.entries(input)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => [key, canonical(value)]),
    );
  }
  return input;
};

async function migrateRecordActivityStateOnce(
  client: ClientBase,
  companyId: string,
  mode: "preflight" | "backfill" | "reconcile",
) {
  await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
  try {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [companyId]);
    const source = await readLegacyModel(client, companyId);
    const preflight = await preflightLegacyRecords(client, source);
    const issues: MigrationIssue[] = [...preflight.issues];
    const state = (
      await client.query(
        'SELECT revision, "storageMode", "activeOperationId" FROM "RecordSchemaState" WHERE "companyId" = $1',
        [companyId],
      )
    ).rows[0];
    const checkpoint = (
      await client.query(
        'SELECT "sourceHash", manifest FROM "RecordMigrationCheckpoint" WHERE "companyId" = $1 AND version = 4',
        [companyId],
      )
    ).rows[0];
    const previous = checkpoint ? Manifest.parse(checkpoint.manifest) : null;
    if (
      state &&
      (state.storageMode !== "backfilled" || state.activeOperationId || state.revision !== (previous ? 2 : 1))
    )
      throw new Error("Migration cannot overwrite an active or configured record model");
    if (!state && mode !== "preflight") throw new Error("Run the legacy record backfill first");
    if (!previous && mode === "reconcile") throw new Error("Activity migration has not been applied");
    const model = { ...source.model, revision: 2, activityPaths: migratedActivityPaths(companyId, source.model) };
    if (validateRecordModel(model).issues.length) throw new Error("Migrated activity paths are invalid");
    if (state) {
      const stored = (
        await client.query(
          'SELECT "actorId", snapshot FROM "RecordSchemaRevision" WHERE "companyId" = $1 AND revision = $2',
          [companyId, state.revision],
        )
      ).rows[0];
      if (
        !stored ||
        !isDeepStrictEqual(RecordModelSchema.parse(stored.snapshot), previous ? model : source.model) ||
        (previous && stored.actorId !== MIGRATION_ACTOR)
      ) {
        issues.push({
          table: "RecordSchemaRevision",
          id: companyId,
          field: "snapshot",
          code: "model_changed_since_backfill",
        });
      }
      for (const [table, expected] of [
        ["RecordTypeDefinition", source.model.types],
        ["RecordFieldDefinition", source.model.fields],
        ["RecordRelationshipDefinition", source.model.relationships],
      ] as const) {
        const rows = (
          await client.query(`SELECT id, definition FROM "${table}" WHERE "companyId" = $1 ORDER BY id`, [companyId])
        ).rows;
        if (
          rows.length !== expected.length ||
          rows.some(
            (row) =>
              !isDeepStrictEqual(
                row.definition,
                expected.find((item) => item.id === row.id),
              ),
          )
        )
          issues.push({ table, id: companyId, field: "definition", code: "model_changed_since_backfill" });
      }
    }
    const widgets: Array<{
      id: string;
      query: ReturnType<typeof migrateActivityQuery>;
      displayOptions: { showFilters: boolean };
      legacy: unknown;
    }> = [];
    let afterId = "";
    for (;;) {
      const page = await client.query(
        'SELECT id, "activityQuery", "timelineFilters", "displayOptions", version FROM "Widget" WHERE "companyId" = $1 AND kind = \'activityTimeline\' AND id > $2 ORDER BY id LIMIT 200',
        [companyId, afterId],
      );
      if (!page.rows.length) break;
      for (const row of page.rows) {
        try {
          const query = migrateActivityQuery(companyId, row.timelineFilters);
          const displayOptions = { showFilters: DisplayOptions.parse(row.displayOptions ?? {}).showFilters ?? true };
          widgets.push({ id: row.id, query, displayOptions, legacy: row.timelineFilters });
          for (const filter of query.filters) {
            if (filter.kind === "record" && filter.recordIds.length) {
              const type = LEGACY_TYPES.find((type) => presetId(companyId, type) === filter.typeId);
              if (!type) throw new Error("Unmapped legacy activity type");
              const refs = await client.query(
                `SELECT wanted.id FROM unnest($2::text[]) wanted(id) WHERE NOT EXISTS (SELECT 1 FROM "${LEGACY_TABLES[type]}" record WHERE record."companyId" = $1 AND record.id = wanted.id) AND NOT EXISTS (SELECT 1 FROM "AuditLog" history WHERE history."companyId" = $1 AND history."entityId" = wanted.id AND history.event IN ($3, $4, $5))`,
                [companyId, filter.recordIds, `${type}.created`, `${type}.updated`, `${type}.deleted`],
              );
              for (const ref of refs.rows) {
                issues.push({
                  table: "Widget",
                  id: row.id,
                  field: `record:${filter.typeId}:${ref.id}`,
                  code: "unresolved_activity_reference",
                });
              }
            } else if (filter.kind === "account" || filter.kind === "thread") {
              const table = filter.kind === "account" ? "ConnectedAccount" : "MessagingThread";
              const refs = await client.query(
                `SELECT wanted.id FROM unnest($2::text[]) wanted(id) WHERE NOT EXISTS (SELECT 1 FROM "${table}" record WHERE record."companyId" = $1 AND record.id = wanted.id)`,
                [companyId, filter.values],
              );
              for (const ref of refs.rows) {
                issues.push({
                  table: "Widget",
                  id: row.id,
                  field: `${filter.kind}:${ref.id}`,
                  code: "unresolved_activity_reference",
                });
              }
            }
          }
          if (row.version !== 1 || (!previous && row.activityQuery !== null))
            issues.push({ table: "Widget", id: row.id, field: "activityQuery", code: "widget_changed_since_backfill" });
          if (
            previous &&
            (!isDeepStrictEqual(row.activityQuery, query) || !isDeepStrictEqual(row.displayOptions, displayOptions))
          )
            issues.push({ table: "Widget", id: row.id, field: "activityQuery", code: "activity_query_mismatch" });
        } catch {
          issues.push({
            table: "Widget",
            id: row.id,
            field: "timelineFilters",
            code: "unsupported_activity_configuration",
          });
        }
      }
      afterId = page.rows[page.rows.length - 1].id;
    }
    const sourceHash = createHash("sha256")
      .update(
        JSON.stringify(
          canonical({
            model: source.model,
            widgets: widgets.map(({ id, legacy, displayOptions }) => ({ id, legacy, displayOptions })),
          }),
        ),
      )
      .digest("hex");
    if (checkpoint && checkpoint.sourceHash !== sourceHash) {
      issues.push({
        table: "RecordMigrationCheckpoint",
        id: companyId,
        field: "sourceHash",
        code: "migration_source_changed",
      });
    }
    if (
      previous &&
      !isDeepStrictEqual(
        previous.widgetIds,
        widgets.map((widget) => widget.id),
      )
    ) {
      issues.push({
        table: "RecordMigrationCheckpoint",
        id: companyId,
        field: "widgetIds",
        code: "migration_source_changed",
      });
    }
    const reconciliation = state ? await reconcileMigratedRecords(client, source) : null;
    if (reconciliation) issues.push(...reconciliation.issues);
    if (previous) issues.push(...(await reconcileCalculationProvenance(client, companyId)));
    if (mode === "preflight" || issues.length || previous) {
      await client.query("ROLLBACK");
      return {
        version: 4,
        companyId,
        ok: issues.length === 0,
        issues,
        preflight,
        reconciliation,
        resumed: Boolean(previous),
        widgets: widgets.length,
        provenance: previous,
      };
    }
    const existingDependencies = (
      await client.query('SELECT COUNT(*) FROM "RecordValueDependency" WHERE "companyId" = $1', [companyId])
    ).rows[0].count;
    if (existingDependencies !== "0") throw new Error("Unexpected calculation provenance before activity migration");
    const provenance = await backfillCalculationProvenance(client, companyId, model);
    issues.push(...(await reconcileCalculationProvenance(client, companyId)));
    if (issues.length) {
      await client.query("ROLLBACK");
      return {
        version: 4,
        companyId,
        ok: false,
        issues,
        preflight,
        reconciliation,
        resumed: false,
        widgets: widgets.length,
        provenance,
      };
    }
    for (const widget of widgets) {
      await client.query(
        'UPDATE "Widget" SET "activityQuery" = $3::jsonb, "displayOptions" = $4::jsonb WHERE "companyId" = $1 AND id = $2',
        [companyId, widget.id, JSON.stringify(widget.query), JSON.stringify(widget.displayOptions)],
      );
    }
    await client.query(
      'INSERT INTO "RecordSchemaRevision" ("companyId", revision, "actorId", snapshot) VALUES ($1, 2, $2, $3)',
      [companyId, MIGRATION_ACTOR, JSON.stringify(model)],
    );
    await client.query('UPDATE "RecordSchemaState" SET revision = 2 WHERE "companyId" = $1', [companyId]);
    await client.query(
      'INSERT INTO "RecordMigrationCheckpoint" ("companyId", version, "sourceHash", manifest) VALUES ($1, 4, $2, $3)',
      [
        companyId,
        sourceHash,
        JSON.stringify({ schemaRevision: 2, widgetIds: widgets.map((widget) => widget.id), ...provenance }),
      ],
    );
    await client.query("COMMIT");
    return {
      version: 4,
      companyId,
      ok: true,
      issues,
      preflight,
      reconciliation,
      resumed: false,
      widgets: widgets.length,
      provenance,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

export function migrateRecordActivityState(
  client: ClientBase,
  companyId: string,
  mode: "preflight" | "backfill" | "reconcile",
) {
  return retryMigrationTransaction(() => migrateRecordActivityStateOnce(client, companyId, mode));
}
