import { z } from "zod";
import { WidgetKind } from "@/generated/prisma";
import {
  getUpsertRecordWidgetInteractor,
  getUpsertRecordActivityWidgetInteractor,
  getGetWidgetsInteractor,
  getGetWidgetByIdInteractor,
  getDeleteWidgetInteractor,
} from "@/core/di";
import { RecordWidgetInputSchema } from "@/features/widget/record-widget.schema";
import { RecordMeasureSchema } from "@/features/records/record-measure.schema";
import { WidgetDisplayOptionsSchema, isRecordWidget, type WidgetLayout } from "@/features/widget/widget.schema";
import { WidgetPlacementSchema, occupiedGrid } from "@/features/widget/widget-grid";
import { RecordActivityQuerySchema } from "@/ee/messaging/activities/record-activities.schema";
import { RecordActivityWidgetInputSchema } from "@/features/widget/record-activity-widget.schema";
import { CustomErrorCode } from "@/core/validation/validation.types";
import {
  customMcpFailure,
  formatDatesInResponse,
  mcpInteractorFailure,
  mcpMessageFailure,
  mcpValidationFailure,
  nestedValidationErrorText,
  nestedCustomErrorText,
  toonResult,
} from "./utils";

const ManageWidgetsSchema = z
  .object({
    action: z.enum(["create", "update", "delete", "get", "list"]),
    kind: z.enum(WidgetKind).optional(),
    id: z.uuid().optional(),
    ids: z.array(z.uuid()).min(1).max(100).optional(),
    name: z.string().trim().min(1).max(255).optional(),
    expectedRevision: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .describe("Widget writes require the discovered configuration revision."),
    expectedVersion: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Widget updates require the saved widget version."),
    idempotencyKey: z
      .string()
      .min(8)
      .max(200)
      .optional()
      .describe("Widget writes require a stable retry key. Use a new key for a different change."),
    measure: RecordMeasureSchema.optional().describe(
      "Count or aggregate records at source.typeId. Field and relationship references are stable IDs. Group paths and assignee groups use full attribution; the separate overall total counts each source record once. groupBy.dateInterval buckets a date grouping into calendar periods for time series.",
    ),
    displayOptions: WidgetDisplayOptionsSchema.optional(),
    isTemplate: z.boolean().optional(),
    activityQuery: RecordActivityQuerySchema.optional(),
    showFilters: z
      .boolean()
      .optional()
      .describe("Activity timeline appearance only. Chart options belong in displayOptions."),
    layout: WidgetPlacementSchema.optional(),
    viewId: z
      .uuid()
      .nullable()
      .optional()
      .describe(
        "Dashboard view (manage_data_views surfaceKey dashboard) that holds the widget, or null for the main dashboard. Omit it to use the caller's current dashboard view on create or to keep the widget's view on update.",
      ),
  })
  .strict();

function placementOf(layout: WidgetLayout | null | undefined) {
  const large = layout?.lg;
  return large && large.y !== null && large.y !== undefined
    ? { layout: { x: large.x, y: large.y, w: large.w, h: large.h } }
    : {};
}

const ActivityChangeSchema = ManageWidgetsSchema.pick({
  action: true,
  kind: true,
  id: true,
  name: true,
  isTemplate: true,
  activityQuery: true,
  expectedVersion: true,
  expectedRevision: true,
  idempotencyKey: true,
  showFilters: true,
  layout: true,
  viewId: true,
});
const ChartChangeSchema = ManageWidgetsSchema.omit({ activityQuery: true, showFilters: true, ids: true });

export const manageWidgetsTool = {
  name: "manage_widgets",
  title: "Manage widgets",
  description:
    "Use this when the user asks to see, create, change or delete their dashboard widgets. A widget you create stays on their dashboard, so never create or update one to work out an answer; answer data questions with query_crm_measure or query_crm_records instead. Dashboard widgets. list returns IDs, names, each widget's dashboard view (viewId, null for the main dashboard) and its current layout within that view; get (ids) returns saved configuration and access-filtered results. Create a chart with name, measure, displayOptions, expectedRevision and idempotencyKey. Discover type and field IDs first. displayOptions.displayType must fit the measure: number needs groupBy null, areaChart needs groupBy.dateInterval, rankedTable needs a grouping and funnelChart needs a single-choice grouping field; other chart styles accept any grouping. Update a chart with id, expectedVersion, expectedRevision, idempotencyKey and changed fields; measure and displayOptions replace the complete previous value. Results preserve exact decimal strings and missing, restricted or error states. Activity timelines use kind activityTimeline, name, activityQuery, expectedRevision, idempotencyKey and showFilters. activityQuery scopes stable record/type IDs and combines typed inclusion/exclusion filters; updates also require expectedVersion. isTemplate controls sharing of configuration; viewers still need access to the underlying data. Position and size: layout {x, y, w, h} on the 12-column desktop grid (rows of 124 px) is optional on create and update; omit it to auto-place a new widget in the first free spot with a size that fits its display type, or to keep an existing widget where it is. A layout that overlaps another widget is refused, widgets float up into empty rows above them, and the result returns the saved layout. Dashboard views are saved views of manage_data_views surface dashboard; viewId puts a widget on one (default: the caller's current view on create, unchanged on update) and layouts are per view. To build a dashboard, list or get the existing widgets first and place new ones beside them. Delete requires id and permanently removes the widget configuration, not its source records.",
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  inputSchema: ManageWidgetsSchema,
  outputSchema: z.looseObject({
    items: z.array(z.looseObject({ id: z.string() })).optional(),
    id: z.string().optional(),
    kind: z.string().optional(),
    name: z.string().optional(),
    version: z.number().optional(),
    layout: z.looseObject({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }).optional(),
    deleted: z.boolean().optional(),
  }),
  execute: async (input: unknown) => {
    const parsed = ManageWidgetsSchema.safeParse(input);
    if (!parsed.success) return mcpValidationFailure(parsed.error);
    const params = parsed.data;
    if (params.action === "list") {
      const valid = z
        .object({ action: z.literal("list") })
        .strict()
        .safeParse(params);
      if (!valid.success) return mcpValidationFailure(valid.error);
      const result = await getGetWidgetsInteractor().invoke({ allViews: true });
      const widgets = result.data.items;
      const grids = new Map<string | null, ReturnType<typeof occupiedGrid>>();
      for (const viewId of new Set(widgets.map((widget) => widget.viewId)))
        grids.set(viewId, occupiedGrid(widgets.filter((widget) => widget.viewId === viewId)));
      return toonResult({
        total: widgets.length,
        items: widgets.map((widget) => {
          const rect = grids.get(widget.viewId)?.find((placed) => placed.id === widget.id);
          return {
            id: widget.id,
            name: widget.name,
            kind: widget.kind,
            version: widget.version,
            viewId: widget.viewId,
            ...(rect ? { layout: { x: rect.x, y: rect.y, w: rect.w, h: rect.h } } : {}),
          };
        }),
      });
    }
    if (params.action === "get") {
      const valid = z
        .object({ action: z.literal("get"), ids: z.array(z.uuid()).min(1).max(100) })
        .strict()
        .safeParse(params);
      if (!valid.success) return mcpValidationFailure(valid.error);
      const items = await Promise.all(
        valid.data.ids.map(async (id) => {
          const result = await getGetWidgetByIdInteractor().invoke({ id });
          if (!result.ok) return { id, error: nestedValidationErrorText(result.error) };
          return result.data ?? { id, error: await nestedCustomErrorText(CustomErrorCode.widgetNotFound) };
        }),
      );
      return toonResult({ items: formatDatesInResponse(items) });
    }
    if (params.action === "delete") {
      const valid = z
        .object({ action: z.literal("delete"), id: z.uuid() })
        .strict()
        .safeParse(params);
      if (!valid.success) return mcpValidationFailure(valid.error);
      const result = await getDeleteWidgetInteractor().invoke({ id: valid.data.id });
      return result.ok ? toonResult({ id: valid.data.id, deleted: true }) : mcpInteractorFailure(result.error);
    }
    if (params.action === "create" && !params.name)
      return mcpMessageFailure("Creation requires a widget name.", ["name"]);
    if (params.action === "create" && (params.id || params.expectedVersion))
      return mcpMessageFailure("Creation cannot supply an existing widget ID or version.");
    if (params.action === "update" && !params.id) return mcpMessageFailure("An update requires the widget ID.", ["id"]);
    const existing = params.id ? await getGetWidgetByIdInteractor().invoke({ id: params.id }) : null;
    if (existing && !existing.ok) return mcpInteractorFailure(existing.error);
    if (existing && !existing.data) return customMcpFailure(CustomErrorCode.widgetNotFound);
    const widget = existing?.data;
    if (widget && params.kind && params.kind !== widget.kind)
      return customMcpFailure(CustomErrorCode.widgetKindImmutable);
    const kind = widget?.kind ?? params.kind ?? WidgetKind.chart;
    if (kind === WidgetKind.activityTimeline) {
      const valid = ActivityChangeSchema.safeParse(params);
      if (!valid.success) return mcpValidationFailure(valid.error);
      if (widget && widget.kind !== WidgetKind.activityTimeline)
        return customMcpFailure(CustomErrorCode.widgetKindImmutable);
      const change = RecordActivityWidgetInputSchema.safeParse({
        id: params.id,
        expectedVersion: params.expectedVersion,
        expectedRevision: params.expectedRevision,
        idempotencyKey: params.idempotencyKey,
        name: params.name ?? widget?.name,
        activityQuery: params.activityQuery ?? widget?.activityQuery,
        displayOptions: { showFilters: params.showFilters ?? widget?.displayOptions.showFilters ?? true },
        isTemplate: params.isTemplate ?? widget?.isTemplate ?? false,
        layout: params.layout,
        viewId: params.viewId,
      });
      if (!change.success) return mcpValidationFailure(change.error);
      const result = await getUpsertRecordActivityWidgetInteractor().invoke(change.data);
      return result.ok
        ? toonResult({
            id: result.data.id,
            kind: result.data.kind,
            name: result.data.name,
            version: result.data.version,
            ...placementOf(result.data.layout),
          })
        : mcpInteractorFailure(result.error);
    }
    const chart = widget && isRecordWidget(widget) ? widget : undefined;
    const valid = ChartChangeSchema.safeParse(params);
    if (!valid.success) return mcpValidationFailure(valid.error);
    const change = RecordWidgetInputSchema.safeParse({
      id: params.id,
      expectedVersion: params.expectedVersion,
      expectedRevision: params.expectedRevision,
      idempotencyKey: params.idempotencyKey,
      name: params.name ?? widget?.name,
      measure: params.measure ?? chart?.measure,
      displayOptions: params.displayOptions ?? widget?.displayOptions,
      isTemplate: params.isTemplate ?? widget?.isTemplate ?? false,
      layout: params.layout,
      viewId: params.viewId,
    });
    if (!change.success) return mcpValidationFailure(change.error);
    const result = await getUpsertRecordWidgetInteractor().invoke(change.data);
    return result.ok
      ? toonResult({
          id: result.data.id,
          kind: result.data.kind,
          name: result.data.name,
          version: result.data.version,
          ...placementOf(result.data.layout),
        })
      : mcpInteractorFailure(result.error);
  },
};
