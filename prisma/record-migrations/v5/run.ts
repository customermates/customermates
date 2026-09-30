import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { ClientBase } from "pg";
import { z } from "zod";
import { retryMigrationTransaction } from "../retry-transaction";
import { LEGACY_TYPES, readLegacyModel, type MigrationIssue } from "../v2/legacy-model";
import { presetId } from "../v2/contract/crm-preset";
import { preflightLegacyRecords } from "../v2/preflight";
import { reconcileMigratedRecords } from "../v2/reconcile";
import { reconcileCalculationProvenance } from "../v4/provenance";
import { migratedActivityPaths } from "../v4/activity-paths";
import { migrateActivityQuery } from "../v4/activity-query";
import { presentationMigrationModel } from "./model";
import { DETAIL_SURFACES, LIST_SURFACES, PresentationMigrationError } from "./columns";
import { migrateDetailState, migratePresentationState } from "./state";
import { migrateChartMeasure } from "./widgets";
import { WidgetDisplayOptionsSchema } from "./contract/widget-display.schema";
import { migrateQueryFilter } from "./filters";
import { validatePresentationReferences } from "./references";
import type { RecordQuery } from "./contract/record-query.schema";
import { resolveRecordPath } from "./contract/record-relationship-path";

const MIGRATION_ACTOR = "system:record-migration:v5";
const JsonObject = z.record(z.string(), z.json());
const RowChange = z
  .object({ table: z.enum(["DataView", "P13n", "Widget"]), id: z.string(), original: JsonObject, target: JsonObject })
  .strict();
const Manifest = z
  .object({ schemaRevision: z.literal(3), previousSourceHash: z.string(), rows: z.array(RowChange) })
  .strict();
type Change = z.infer<typeof RowChange>;
type Issue = MigrationIssue & { message?: string };
const canonical = (input: unknown): unknown => {
  if (Array.isArray(input)) return input.map(canonical);
  if (input && typeof input === "object") {
    return Object.fromEntries(
      Object.entries(input)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, value]) => [key, canonical(value)]),
    );
  }
  return input;
};
const hash = (input: unknown) =>
  createHash("sha256")
    .update(JSON.stringify(canonical(input)))
    .digest("hex");

function conversionIssue(table: string, id: string, error: unknown): Issue[] {
  if (error instanceof PresentationMigrationError) return [{ table, id, field: error.field, code: error.code }];
  if (error instanceof z.ZodError) {
    return error.issues.map((issue) => ({
      table,
      id,
      field: issue.path.join("."),
      code: "invalid_presentation_configuration",
      message: issue.message,
    }));
  }
  throw error;
}

async function readRows(client: ClientBase, companyId: string, table: Change["table"], keys?: string[]) {
  const rows: z.infer<typeof JsonObject>[] = [];
  let afterId = "";
  for (;;) {
    const field = table === "DataView" ? "surfaceKey" : "p13nId";
    const page = await client.query<{ data: z.infer<typeof JsonObject> }>(
      `SELECT to_jsonb(item) AS data FROM "${table}" item WHERE "companyId" = $1 AND id > $2 ${keys ? `AND "${field}" = ANY($3::text[])` : ""} ORDER BY id LIMIT 200`,
      keys ? [companyId, afterId, keys] : [companyId, afterId],
    );
    if (!page.rows.length) break;
    rows.push(...page.rows.map((row) => row.data));
    afterId = z.string().parse(page.rows[page.rows.length - 1].data.id);
  }
  return rows;
}

async function publishRow(client: ClientBase, companyId: string, change: Change) {
  const jsonColumns =
    change.table === "P13n"
      ? ["viewStateKeys", "filters", "sortDescriptor", "columnWidths", "grouping", "detailOptions"]
      : change.table === "DataView"
        ? ["filters", "sortDescriptor", "grouping", "columnOrder", "columnWidths", "hiddenColumns"]
        : ["measure", "displayOptions"];
  const plainColumns =
    change.table === "P13n"
      ? ["p13nId", "columnOrder", "hiddenColumns", "groupingColumnId"]
      : change.table === "DataView"
        ? ["surfaceKey", "groupingColumnId"]
        : [];
  const columns = [...jsonColumns, ...plainColumns].filter(
    (key) => !isDeepStrictEqual(change.original[key], change.target[key]),
  );
  if (!columns.length) return;
  const sets = columns
    .map((key, index) => `"${key}" = $${index + 3}${jsonColumns.includes(key) ? "::jsonb" : ""}`)
    .join(", ");
  const values = columns.map((key) =>
    jsonColumns.includes(key) && change.target[key] !== null ? JSON.stringify(change.target[key]) : change.target[key],
  );
  const updated = await client.query(`UPDATE "${change.table}" SET ${sets} WHERE "companyId" = $1 AND id = $2`, [
    companyId,
    change.id,
    ...values,
  ]);
  if (updated.rowCount !== 1) throw new Error("Presentation row disappeared during publication");
}

async function migratePresentationOnce(
  client: ClientBase,
  companyId: string,
  mode: "preflight" | "backfill" | "reconcile",
) {
  await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
  try {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [companyId]);
    const source = await readLegacyModel(client, companyId);
    const preflight = await preflightLegacyRecords(client, source);
    const issues: Issue[] = [...preflight.issues];
    const model = presentationMigrationModel(source);
    const state = (
      await client.query(
        'SELECT revision, "storageMode", "activeOperationId" FROM "RecordSchemaState" WHERE "companyId" = $1',
        [companyId],
      )
    ).rows[0];
    const checkpoints = (
      await client.query(
        'SELECT version, "sourceHash", manifest FROM "RecordMigrationCheckpoint" WHERE "companyId" = $1 AND version IN (4, 5)',
        [companyId],
      )
    ).rows;
    const predecessor = checkpoints.find((row) => row.version === 4);
    const checkpoint = checkpoints.find((row) => row.version === 5);
    const previous = checkpoint ? Manifest.parse(checkpoint.manifest) : null;
    if (
      state &&
      (state.storageMode !== "backfilled" || state.activeOperationId || state.revision !== (previous ? 3 : 2))
    )
      throw new Error("Presentation migration cannot overwrite an active or configured record model");
    if ((!state || !predecessor) && mode !== "preflight")
      throw new Error("Complete record/activity backfill before presentation migration");
    if (mode === "reconcile" && !previous) throw new Error("Presentation migration has not been applied");
    if (state) {
      const revision = (
        await client.query(
          'SELECT "actorId", snapshot FROM "RecordSchemaRevision" WHERE "companyId" = $1 AND revision = $2',
          [companyId, state.revision],
        )
      ).rows[0];
      const expected = previous
        ? model
        : { ...source.model, revision: 2, activityPaths: migratedActivityPaths(companyId, source.model) };
      if (
        !revision ||
        revision.actorId !== (previous ? MIGRATION_ACTOR : "system:record-migration:v4") ||
        !isDeepStrictEqual(revision.snapshot, expected)
      ) {
        issues.push({
          table: "RecordSchemaRevision",
          id: companyId,
          field: "snapshot",
          code: "model_changed_since_backfill",
        });
      }
      for (const [table, expectedDefinitions] of [
        ["RecordTypeDefinition", previous ? model.types : source.model.types],
        ["RecordFieldDefinition", source.model.fields],
        ["RecordRelationshipDefinition", source.model.relationships],
      ] as const) {
        const definitions = (
          await client.query(`SELECT id, definition FROM "${table}" WHERE "companyId" = $1 ORDER BY id`, [companyId])
        ).rows;
        if (
          definitions.length !== expectedDefinitions.length ||
          definitions.some(
            (row) =>
              !isDeepStrictEqual(
                row.definition,
                expectedDefinitions.find((definition) => definition.id === row.id),
              ),
          )
        )
          issues.push({ table, id: companyId, field: "definition", code: "model_changed_since_backfill" });
      }
    }
    const rows: Change[] = [];
    const views = await readRows(client, companyId, "DataView", Object.keys(LIST_SURFACES));
    const preferences = await readRows(client, companyId, "P13n", [
      ...Object.keys(LIST_SURFACES),
      ...Object.keys(DETAIL_SURFACES),
    ]);
    const widgets = await readRows(client, companyId, "Widget");
    if (predecessor) {
      const revision = (
        await client.query(
          'SELECT "actorId", snapshot FROM "RecordSchemaRevision" WHERE "companyId" = $1 AND revision = 2',
          [companyId],
        )
      ).rows[0];
      const expected = { ...source.model, revision: 2, activityPaths: migratedActivityPaths(companyId, source.model) };
      if (
        !revision ||
        revision.actorId !== "system:record-migration:v4" ||
        !isDeepStrictEqual(revision.snapshot, expected)
      )
        issues.push({ table: "RecordSchemaRevision", id: companyId, field: "2", code: "predecessor_model_changed" });
      const activityWidgets = widgets.filter((row) => row.kind === "activityTimeline");
      const predecessorManifest = z
        .object({
          schemaRevision: z.literal(2),
          widgetIds: z.array(z.uuid()),
          checkedValues: z.number().int(),
          dependencyCount: z.number().int(),
        })
        .strict()
        .parse(predecessor.manifest);
      const expectedHash = hash({
        model: source.model,
        widgets: activityWidgets.map((row) => ({
          id: row.id,
          legacy: row.timelineFilters,
          displayOptions: row.displayOptions,
        })),
      });
      if (
        predecessor.sourceHash !== expectedHash ||
        !isDeepStrictEqual(
          predecessorManifest.widgetIds,
          activityWidgets.map((row) => row.id),
        )
      ) {
        issues.push({
          table: "RecordMigrationCheckpoint",
          id: companyId,
          field: "4",
          code: "predecessor_source_changed",
        });
      }
      for (const row of activityWidgets) {
        try {
          if (
            row.version !== 1 ||
            !isDeepStrictEqual(row.activityQuery, migrateActivityQuery(companyId, row.timelineFilters))
          ) {
            issues.push({
              table: "Widget",
              id: String(row.id),
              field: "activityQuery",
              code: "predecessor_activity_changed",
            });
          }
        } catch {
          issues.push({
            table: "Widget",
            id: String(row.id),
            field: "activityQuery",
            code: "predecessor_activity_changed",
          });
        }
      }
    }
    const originals = previous?.rows ?? [
      ...views.map((row) => ({ table: "DataView" as const, id: String(row.id), original: row, target: row })),
      ...preferences.map((row) => ({ table: "P13n" as const, id: String(row.id), original: row, target: row })),
      ...widgets.map((row) => ({ table: "Widget" as const, id: String(row.id), original: row, target: row })),
    ];
    if (previous && (views.length || preferences.length)) {
      issues.push({
        table: "RecordMigrationCheckpoint",
        id: companyId,
        field: "rows",
        code: "new_legacy_presentation_after_migration",
      });
    }
    for (const table of ["DataView", "P13n"] as const) {
      const keys = LEGACY_TYPES.flatMap((kind) => [
        `records:${presetId(companyId, kind)}`,
        ...(table === "P13n" ? [`record-detail:${presetId(companyId, kind)}`] : []),
      ]);
      const existing = await readRows(client, companyId, table, keys);
      const expected =
        previous?.rows
          .filter((row) => row.table === table)
          .map((row) => row.id)
          .sort() ?? [];
      if (!isDeepStrictEqual(existing.map((row) => row.id).sort(), expected)) {
        issues.push({
          table,
          id: companyId,
          field: "id",
          code: previous ? "presentation_inventory_changed" : "presentation_target_collision",
        });
      }
    }
    for (const saved of originals) {
      const row = saved.original;
      const id = saved.id;
      try {
        let target: Record<string, unknown> = row;
        const scopes: Pick<RecordQuery, "typeId" | "filters" | "relationships" | "relatedFilters">[] = [];
        if (saved.table === "DataView") {
          const kind = LIST_SURFACES[String(row.surfaceKey)];
          if (!kind) throw new PresentationMigrationError("surfaceKey", "unresolved_legacy_surface");
          target = {
            ...migratePresentationState(source, kind, row, model, false),
            surfaceKey: `records:${presetId(companyId, kind)}`,
          };
          scopes.push({ typeId: presetId(companyId, kind), ...migrateQueryFilter(source, kind, row.filters, model) });
        } else if (saved.table === "P13n") {
          const list = LIST_SURFACES[String(row.p13nId)];
          const detail = DETAIL_SURFACES[String(row.p13nId)];
          if (list) {
            target = {
              ...migratePresentationState(source, list, row, model, true),
              p13nId: `records:${presetId(companyId, list)}`,
            };
            scopes.push({ typeId: presetId(companyId, list), ...migrateQueryFilter(source, list, row.filters, model) });
          } else if (detail) target = migrateDetailState(source, detail, row, model);
          else throw new PresentationMigrationError("p13nId", "unresolved_legacy_surface");
        } else if (row.kind === "chart") {
          if (row.measure !== null || row.version !== 1)
            throw new PresentationMigrationError("measure", "widget_already_configured");
          const measure = migrateChartMeasure(source, row, model);
          target = {
            ...row,
            measure,
            displayOptions: WidgetDisplayOptionsSchema.parse(row.displayOptions ?? { displayType: "verticalBarChart" }),
          };
          scopes.push(measure.source);
          if (measure.groupBy?.filter) {
            const steps = resolveRecordPath(measure.source.typeId, measure.groupBy.path, model);
            const typeId = steps?.at(-1)?.typeId ?? measure.source.typeId;
            scopes.push({ typeId, ...measure.groupBy.filter });
          }
        }
        const change = RowChange.parse({ ...saved, target });
        rows.push(change);
        issues.push(
          ...(await validatePresentationReferences(client, companyId, model, scopes, { table: saved.table, id })),
        );
        const owner = await client.query('SELECT id FROM "User" WHERE "companyId" = $1 AND id = $2', [
          companyId,
          row.userId,
        ]);
        if (!owner.rowCount)
          issues.push({ table: saved.table, id, field: "userId", code: "foreign_presentation_owner" });
        if (previous) {
          const stored = (
            await client.query(
              `SELECT to_jsonb(item) AS data FROM "${saved.table}" item WHERE "companyId" = $1 AND id = $2`,
              [companyId, id],
            )
          ).rows[0]?.data;
          if (!isDeepStrictEqual(saved.target, target) || !isDeepStrictEqual(stored, target)) {
            issues.push({
              table: saved.table,
              id,
              field: "configuration",
              code: "presentation_changed_since_migration",
            });
          }
        } else if (saved.table === "P13n") {
          const collision = await client.query(
            'SELECT id FROM "P13n" WHERE "companyId" = $1 AND "userId" = $2 AND "p13nId" = $3 AND id <> $4',
            [companyId, row.userId, target.p13nId, id],
          );
          if (collision.rowCount)
            issues.push({ table: "P13n", id, field: "p13nId", code: "presentation_target_collision" });
        }
      } catch (error) {
        issues.push(...conversionIssue(saved.table, id, error));
      }
    }
    if (
      previous &&
      !isDeepStrictEqual(
        widgets.map((row) => row.id).sort(),
        originals
          .filter((row) => row.table === "Widget")
          .map((row) => row.id)
          .sort(),
      )
    )
      issues.push({ table: "Widget", id: companyId, field: "id", code: "widget_inventory_changed" });
    for (const row of rows.filter((row) => row.table === "P13n" && String(row.target.p13nId).startsWith("records:"))) {
      const active = row.target.activeViewKey;
      if (
        active !== null &&
        active !== undefined &&
        active !== "__all__" &&
        !rows.some(
          (view) =>
            view.table === "DataView" &&
            view.id === active &&
            view.target.userId === row.target.userId &&
            view.target.surfaceKey === row.target.p13nId,
        )
      )
        issues.push({ table: "P13n", id: row.id, field: "activeViewKey", code: "unresolved_active_view" });
    }
    const reconciliation = state ? await reconcileMigratedRecords(client, source) : null;
    if (reconciliation) issues.push(...reconciliation.issues);
    if (predecessor) issues.push(...(await reconcileCalculationProvenance(client, companyId)));
    const sourceHash = hash({
      model: source.model,
      previousSourceHash: predecessor?.sourceHash ?? "",
      originals: originals.map(({ table, id, original }) => ({ table, id, original })),
    });
    if (previous && (checkpoint.sourceHash !== sourceHash || previous.previousSourceHash !== predecessor?.sourceHash)) {
      issues.push({
        table: "RecordMigrationCheckpoint",
        id: companyId,
        field: "sourceHash",
        code: "migration_source_changed",
      });
    }
    const counts = {
      views: rows.filter((row) => row.table === "DataView").length,
      preferences: rows.filter((row) => row.table === "P13n").length,
      charts: rows.filter((row) => row.table === "Widget" && row.original.kind === "chart").length,
    };
    if (mode === "preflight" || issues.length || previous) {
      await client.query("ROLLBACK");
      return {
        version: 5,
        companyId,
        ok: issues.length === 0,
        issues,
        preflight,
        reconciliation,
        resumed: Boolean(previous),
        ...counts,
      };
    }
    for (const row of rows) await publishRow(client, companyId, row);
    for (const type of model.types) {
      const updated = await client.query(
        'UPDATE "RecordTypeDefinition" SET definition = $3::jsonb WHERE "companyId" = $1 AND id = $2 RETURNING definition',
        [companyId, type.id, JSON.stringify(type)],
      );
      if (updated.rowCount !== 1 || !isDeepStrictEqual(updated.rows[0].definition, type))
        throw new Error("Presentation metadata publication mismatch");
    }
    await client.query(
      'INSERT INTO "RecordSchemaRevision" ("companyId", revision, "actorId", snapshot) VALUES ($1, 3, $2, $3::jsonb)',
      [companyId, MIGRATION_ACTOR, JSON.stringify(model)],
    );
    await client.query('UPDATE "RecordSchemaState" SET revision = 3 WHERE "companyId" = $1', [companyId]);
    const manifest = Manifest.parse({ schemaRevision: 3, previousSourceHash: predecessor?.sourceHash, rows });
    await client.query(
      'INSERT INTO "RecordMigrationCheckpoint" ("companyId", version, "sourceHash", manifest) VALUES ($1, 5, $2, $3::jsonb)',
      [companyId, sourceHash, JSON.stringify(manifest)],
    );
    for (const change of rows) {
      const stored = (
        await client.query(
          `SELECT to_jsonb(item) AS data FROM "${change.table}" item WHERE "companyId" = $1 AND id = $2`,
          [companyId, change.id],
        )
      ).rows[0]?.data;
      if (!isDeepStrictEqual(stored, change.target)) throw new Error("Presentation row publication mismatch");
    }
    await client.query("COMMIT");
    return { version: 5, companyId, ok: true, issues, preflight, reconciliation, resumed: false, ...counts };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

export function migrateRecordPresentation(
  client: ClientBase,
  companyId: string,
  mode: "preflight" | "backfill" | "reconcile",
) {
  return retryMigrationTransaction(() => migratePresentationOnce(client, companyId, mode));
}
