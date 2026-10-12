import { z } from "zod";
import { WidgetKind } from "@/generated/prisma";
import {
  getSaveWidgetInteractor,
  getGetWidgetsInteractor,
  getGetWidgetByIdInteractor,
  getDeleteWidgetInteractor,
} from "@/core/di";
import { RecordMeasureSchema } from "@/features/records/record-measure.schema";
import { WidgetDisplayOptionsSchema } from "@/features/widget/widget.schema";
import { WidgetPlacementSchema, occupiedGrid } from "@/features/widget/widget-grid";
import { desktopPlacement } from "@/features/widget/widget-placement";
import { RecordActivityQuerySchema } from "@/ee/messaging/activities/record-activities.schema";
import { CustomErrorCode } from "@/core/validation/validation.types";
import {
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
    kind: z
      .enum(WidgetKind)
      .optional()
      .describe("Widget kind on create: chart (default) or activityTimeline. A saved widget keeps its kind."),
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

export const manageWidgetsTool = {
  name: "manage_widgets",
  title: "Manage widgets",
  description:
    "Use this when the user asks to see, create, change or delete their dashboard widgets. A widget you create stays on their dashboard, so never create or update one to work out an answer; answer data questions with query_crm_measure or query_crm_records instead. Dashboard widgets. list returns IDs, names, each widget's dashboard view (viewId, null for the main dashboard) and its current layout within that view; get (ids) returns saved configuration and access-filtered results. Create a chart with name, measure, displayOptions, expectedRevision and idempotencyKey. Discover type and field IDs first. displayOptions.displayType must fit the measure: number needs groupBy null, areaChart needs groupBy.dateInterval, rankedTable needs a grouping and funnelChart needs a single-choice grouping field; other chart styles accept any grouping. Update a chart with id, expectedVersion, expectedRevision, idempotencyKey and changed fields; measure and displayOptions replace the complete previous value. Results preserve exact decimal strings and missing, restricted or error states. Activity timelines use kind activityTimeline, name, activityQuery, expectedRevision, idempotencyKey and showFilters. activityQuery scopes stable record/type IDs and combines typed inclusion/exclusion filters; updates also require expectedVersion. isTemplate controls sharing of configuration; viewers still need access to the underlying data. Position and size: layout {x, y, w, h} on the 12-column desktop grid (rows of 54 px with 12 px gaps) is optional on create and update; omit it to auto-place a new widget in the first free spot with a size that fits its display type, or to keep an existing widget where it is. A layout that overlaps another widget is refused, widgets float up into empty rows above them, and the result returns the saved layout. Dashboard views are saved views of manage_data_views surface dashboard; viewId puts a widget on one (default: the caller's current view on create, unchanged on update) and layouts are per view. To build a dashboard, list or get the existing widgets first and place new ones beside them. Delete requires id and moves the widget to Trash, where it is deleted permanently after 30 days unless manage_trash restores it with the returned trashBatchId; it never touches its source records.",
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
      return result.ok
        ? toonResult({ id: valid.data.id, deleted: true, trashBatchId: result.data.trashBatchId })
        : mcpInteractorFailure(result.error);
    }
    const { action, showFilters, displayOptions, ...change } = params;
    if (action === "create" && (change.id || change.expectedVersion))
      return mcpMessageFailure("Creation cannot supply an existing widget ID or version.");
    if (action === "update" && !change.id) return mcpMessageFailure("An update requires the widget ID.", ["id"]);
    const options = showFilters === undefined ? displayOptions : { ...displayOptions, showFilters };
    const result = await getSaveWidgetInteractor().invoke({
      ...change,
      ...(options ? { displayOptions: options } : {}),
    });
    return result.ok
      ? toonResult({
          id: result.data.id,
          kind: result.data.kind,
          name: result.data.name,
          version: result.data.version,
          ...desktopPlacement(result.data.layout),
        })
      : mcpInteractorFailure(result.error);
  },
};
