import { z } from "zod";
import { EntityType, WidgetGroupByType, AggregationType, WidgetKind } from "@/generated/prisma";

import {
  encodeToToon,
  runInteractor,
  customMcpFailure,
  enumHint,
  formatDatesInResponse,
  FILTER_FIELD_DESCRIPTION,
  mcpInteractorFailure,
  mcpValidationFailure,
  nestedCustomErrorText,
  nestedValidationErrorText,
  toonResult,
} from "./utils";

import {
  getUpsertWidgetInteractor,
  getGetWidgetsInteractor,
  getGetWidgetByIdInteractor,
  getDeleteWidgetInteractor,
} from "@/core/di";
import type { UpsertActivityWidgetData, UpsertChartWidgetData } from "@/features/widget/upsert-widget.interactor";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { ChartColor, DisplayType } from "@/features/widget/widget.schema";
import { FilterSchema } from "@/core/base/base-get.schema";
import { ActivityFiltersSchema } from "@/ee/messaging/activities/activities.schema";

const entityTypeValues = Object.values(EntityType);
const groupByValues = Object.values(WidgetGroupByType);
const aggregationValues = Object.values(AggregationType);
const displayTypeValues = Object.values(DisplayType);
const chartColorValues = Object.values(ChartColor);

const ChartCreateWidgetSchema = z
  .object({
    action: z.literal("create"),
    kind: z.literal(WidgetKind.chart).optional(),
    name: z.string().min(1).describe("Human-readable widget title shown on the dashboard"),
    entityType: z.enum(EntityType).describe(`Entity type the widget counts/aggregates ${enumHint(entityTypeValues)}`),
    entityFilters: z
      .array(FilterSchema)
      .optional()
      .describe(`Filters applied to the entity. ${FILTER_FIELD_DESCRIPTION}`),
    dealFilters: z
      .array(FilterSchema)
      .optional()
      .describe(
        `Filters applied to deals when aggregating dealValue/dealQuantity. Not allowed when entityType is deal. ${FILTER_FIELD_DESCRIPTION}`,
      ),
    displayType: z.enum(DisplayType).describe(`Chart type ${enumHint(displayTypeValues)}`),
    groupByType: z.enum(WidgetGroupByType).describe(`How to group the data ${enumHint(groupByValues)}`),
    groupByCustomColumnId: z
      .uuid()
      .optional()
      .describe("Custom-column id to group by. Required if groupByType is customColumn."),
    aggregationType: z
      .enum(AggregationType)
      .describe(
        `Aggregation to compute. ${enumHint(aggregationValues)}. ` +
          "count = number of entities; dealValue = sum of related deal values; dealQuantity = sum of related deal quantities.",
      ),
  })
  .strict();

const ActivityCreateWidgetSchema = z
  .object({
    action: z.literal("create"),
    kind: z.literal(WidgetKind.activityTimeline),
    name: z.string().min(1).describe("Human-readable widget title shown on the dashboard"),
    timelineFilters: ActivityFiltersSchema.optional(),
    showFilters: z.boolean().optional().describe("Show the activity count and active filters below the title"),
  })
  .strict();

const ChartUpdateWidgetSchema = z
  .object({
    action: z.literal("update"),
    id: z.uuid().describe("Widget id"),
    name: z.string().min(1).optional(),
    groupByType: z
      .enum(WidgetGroupByType)
      .optional()
      .describe(`${enumHint(groupByValues)}`),
    groupByCustomColumnId: z.uuid().optional().describe("Custom-column id. Required if groupByType is customColumn."),
    aggregationType: z
      .enum(AggregationType)
      .optional()
      .describe(`${enumHint(aggregationValues)}`),
    entityFilters: z.array(FilterSchema).optional().describe(`REPLACES entity filters. ${FILTER_FIELD_DESCRIPTION}`),
    dealFilters: z.array(FilterSchema).optional().describe(`REPLACES deal filters. ${FILTER_FIELD_DESCRIPTION}`),
    displayType: z
      .enum(DisplayType)
      .optional()
      .describe(`${enumHint(displayTypeValues)}`),
    reverseXAxis: z.boolean().optional(),
    reverseYAxis: z.boolean().optional(),
    barColors: z
      .array(z.enum(ChartColor))
      .optional()
      .describe(`Each color ${enumHint(chartColorValues)}`),
  })
  .strict();

const ActivityUpdateWidgetSchema = z
  .object({
    action: z.literal("update"),
    id: z.uuid().describe("Widget id"),
    name: z.string().min(1).optional(),
    timelineFilters: ActivityFiltersSchema.optional().describe("REPLACES the activity filter array"),
    showFilters: z.boolean().optional().describe("Show the activity count and active filters below the title"),
  })
  .strict();

const GetWidgetsSchema = z
  .object({
    action: z.literal("get"),
    ids: z.array(z.uuid()).min(1).max(100).describe("Widget ids to fetch"),
  })
  .strict();

const DeleteWidgetSchema = z.object({ action: z.literal("delete"), id: z.uuid().describe("Widget id") });
const ListWidgetsSchema = z.object({ action: z.literal("list") });

const ManageWidgetsSchema = z.object({
  action: z
    .enum(["create", "update", "delete", "get", "list"])
    .describe(
      "list = ids, names, and kinds; get = full config (computed data for charts); create/update/delete = manage widgets",
    ),
  kind: z
    .enum(WidgetKind)
    .optional()
    .describe("create only. Omit for a chart; use activityTimeline for an activity widget."),
  id: z.uuid().optional().describe("Widget id. Required for update and delete."),
  ids: z.array(z.uuid()).min(1).max(100).optional().describe("get only. Widget ids to fetch."),
  name: z
    .string()
    .min(1)
    .optional()
    .describe("Human-readable widget title shown on the dashboard. Required for create; optional rename on update."),
  entityType: z
    .enum(EntityType)
    .optional()
    .describe(
      `Entity type the widget counts/aggregates ${enumHint(entityTypeValues)}. Required for create; immutable on update.`,
    ),
  entityFilters: z
    .array(FilterSchema)
    .optional()
    .describe(
      `create and update; on update REPLACES the entity filter array. Filters applied to the entity. ${FILTER_FIELD_DESCRIPTION}`,
    ),
  dealFilters: z
    .array(FilterSchema)
    .optional()
    .describe(
      `create and update; on update REPLACES the deal filter array. Applied when aggregating dealValue/dealQuantity. Not allowed when entityType is deal. ${FILTER_FIELD_DESCRIPTION}`,
    ),
  displayType: z
    .enum(DisplayType)
    .optional()
    .describe(`Chart type ${enumHint(displayTypeValues)}. Required for create.`),
  groupByType: z
    .enum(WidgetGroupByType)
    .optional()
    .describe(`How to group the data ${enumHint(groupByValues)}. Required for create.`),
  groupByCustomColumnId: z
    .uuid()
    .optional()
    .describe("create and update. Custom-column id to group by. Required when groupByType is customColumn."),
  aggregationType: z
    .enum(AggregationType)
    .optional()
    .describe(
      `Aggregation to compute ${enumHint(aggregationValues)}. Required for create. ` +
        "count = number of entities; dealValue = sum of related deal values; dealQuantity = sum of related deal quantities.",
    ),
  reverseXAxis: z.boolean().optional().describe("update only."),
  reverseYAxis: z.boolean().optional().describe("update only."),
  barColors: z
    .array(z.enum(ChartColor))
    .optional()
    .describe(`update only. Each color ${enumHint(chartColorValues)}`),
  timelineFilters: ActivityFiltersSchema.optional().describe(
    "activityTimeline create/update only; each field may appear once. On update REPLACES the activity filter array. Create rejects inaccessible relationship UUIDs; update may retain or remove only unavailable UUIDs already stored on that widget.",
  ),
  showFilters: z
    .boolean()
    .optional()
    .describe("activityTimeline create/update only. Show the activity count and active filters below the title."),
});

const ManageWidgetsOutputSchema = z.union([
  z.object({ items: z.array(z.looseObject({ id: z.string() })) }),
  z.looseObject({ id: z.string(), kind: z.string(), name: z.string() }),
  z.object({ deleted: z.literal(true), id: z.string() }),
]);

export const manageWidgetsTool = {
  name: "manage_widgets",
  title: "Manage widgets",
  description:
    "Use this when you need to create, update, delete, or read dashboard widgets. " +
    "action list returns { id, name, kind } entries. " +
    "action get returns full configuration; chart widgets include computed data points, while activityTimeline widgets expose timelineFilters for reuse with get_activities. " +
    "Each chart data point has value and either { labelKind: literal, label } or { labelKind: system, systemLabelKey }, so it answers questions like total pipeline value by stage in one call. " +
    "For chart creation omit kind and provide name, entityType, displayType, groupByType, aggregationType. " +
    "For activityTimeline creation provide kind, name, and optional timelineFilters/showFilters. " +
    "Updates infer the immutable stored kind; only provided fields change and filter arrays replace their previous values. " +
    "Create rejects inaccessible relationship UUIDs; update may retain or remove an unavailable UUID only when that same UUID is already stored. " +
    "action delete is IRREVERSIBLE.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: false,
  },
  inputSchema: ManageWidgetsSchema,
  outputSchema: ManageWidgetsOutputSchema,
  execute: async (params: z.infer<typeof ManageWidgetsSchema>) => {
    if (params.action === "list") {
      const parsed = ListWidgetsSchema.safeParse(params);
      if (!parsed.success) return mcpValidationFailure(parsed.error);
      const result = await getGetWidgetsInteractor().invoke();
      const widgets = result.data;
      return toonResult({
        items: widgets.map((widget) => ({
          id: widget.id,
          name: widget.name,
          kind: widget.kind,
        })),
        total: widgets.length,
      });
    }
    if (params.action === "get") {
      const parsed = GetWidgetsSchema.safeParse(params);
      if (!parsed.success) return mcpValidationFailure(parsed.error);
      const results = await Promise.all(
        parsed.data.ids.map(async (id) => {
          const result = await getGetWidgetByIdInteractor().invoke({ id });
          if (!result.ok) return { error: nestedValidationErrorText(result.error) };
          const widget = result.data;
          if (!widget) {
            return {
              error: await nestedCustomErrorText(CustomErrorCode.widgetNotFound),
            };
          }
          return widget;
        }),
      );
      const detail = formatDatesInResponse(results);
      return { text: encodeToToon(detail), structuredContent: { items: detail } };
    }
    if (params.action === "create") {
      const kind = params.kind ?? WidgetKind.chart;
      const parsed =
        kind === WidgetKind.activityTimeline
          ? ActivityCreateWidgetSchema.safeParse(params)
          : ChartCreateWidgetSchema.safeParse(params);
      if (!parsed.success) return mcpValidationFailure(parsed.error);
      const payload =
        parsed.data.kind === WidgetKind.activityTimeline
          ? ({
              kind: WidgetKind.activityTimeline,
              name: parsed.data.name,
              timelineFilters: parsed.data.timelineFilters ?? [],
              displayOptions: { showFilters: parsed.data.showFilters ?? true },
              isTemplate: false,
            } satisfies UpsertActivityWidgetData)
          : ({
              kind: WidgetKind.chart,
              name: parsed.data.name,
              entityType: parsed.data.entityType,
              groupByType: parsed.data.groupByType,
              groupByCustomColumnId: parsed.data.groupByCustomColumnId,
              aggregationType: parsed.data.aggregationType,
              entityFilters: parsed.data.entityFilters ?? [],
              dealFilters: parsed.data.dealFilters ?? [],
              displayOptions: {
                displayType: parsed.data.displayType,
                reverseXAxis: false,
                reverseYAxis: false,
                barColors: [ChartColor.primary1, ChartColor.primary2],
              },
              isTemplate: false,
            } satisfies UpsertChartWidgetData);
      return runInteractor(getUpsertWidgetInteractor().invoke(payload), (data) =>
        toonResult({
          id: data.id,
          kind: data.kind,
          name: data.name,
          message: `Widget "${data.name}" created successfully`,
        }),
      );
    }
    if (params.action === "update") {
      const target = z.object({ id: z.uuid() }).safeParse(params);
      if (!target.success) return mcpValidationFailure(target.error);
      const widgetResult = await getGetWidgetByIdInteractor().invoke({
        id: target.data.id,
      });
      if (!widgetResult.ok) return mcpInteractorFailure(widgetResult.error);
      const widget = widgetResult.data;
      if (!widget) return customMcpFailure(CustomErrorCode.widgetNotFound);

      if (widget.kind === WidgetKind.activityTimeline) {
        const parsed = ActivityUpdateWidgetSchema.safeParse(params);
        if (!parsed.success) return mcpValidationFailure(parsed.error);
        const updateParams = parsed.data;
        const displayOptions =
          updateParams.showFilters === undefined
            ? (widget.displayOptions ?? undefined)
            : {
                ...(widget.displayOptions ?? {}),
                showFilters: updateParams.showFilters,
              };
        const result = await getUpsertWidgetInteractor().invoke({
          id: widget.id,
          kind: WidgetKind.activityTimeline,
          name: updateParams.name ?? widget.name,
          ...(updateParams.timelineFilters !== undefined ? { timelineFilters: updateParams.timelineFilters } : {}),
          displayOptions,
          isTemplate: widget.isTemplate,
        });
        if (!result.ok) return mcpInteractorFailure(result.error);

        return toonResult({
          id: result.data.id,
          kind: result.data.kind,
          name: result.data.name,
          message: `Widget "${result.data.name}" updated`,
        });
      }

      const parsed = ChartUpdateWidgetSchema.safeParse(params);
      if (!parsed.success) return mcpValidationFailure(parsed.error);
      const updateParams = parsed.data;

      const displayOptionsChanged =
        updateParams.displayType !== undefined ||
        updateParams.reverseXAxis !== undefined ||
        updateParams.reverseYAxis !== undefined ||
        updateParams.barColors !== undefined;

      const updates: Partial<Omit<UpsertChartWidgetData, "id" | "kind">> = {};
      if (updateParams.name !== undefined) updates.name = updateParams.name;
      if (updateParams.groupByType !== undefined) updates.groupByType = updateParams.groupByType;
      if (updateParams.groupByCustomColumnId !== undefined)
        updates.groupByCustomColumnId = updateParams.groupByCustomColumnId;
      if (updateParams.aggregationType !== undefined) updates.aggregationType = updateParams.aggregationType;
      if (Array.isArray(updateParams.entityFilters)) updates.entityFilters = updateParams.entityFilters;
      if (Array.isArray(updateParams.dealFilters)) updates.dealFilters = updateParams.dealFilters;
      if (displayOptionsChanged) {
        updates.displayOptions = {
          ...(widget.displayOptions ?? {}),
          displayType: updateParams.displayType ?? widget.displayOptions?.displayType ?? DisplayType.verticalBarChart,
          reverseXAxis: updateParams.reverseXAxis ?? widget.displayOptions?.reverseXAxis,
          reverseYAxis: updateParams.reverseYAxis ?? widget.displayOptions?.reverseYAxis,
          barColors: updateParams.barColors ?? widget.displayOptions?.barColors,
        };
      }

      const result = await getUpsertWidgetInteractor().invoke({
        id: updateParams.id,
        kind: WidgetKind.chart,
        name: widget.name,
        entityType: widget.entityType,
        groupByType: widget.groupByType,
        groupByCustomColumnId: widget.groupByCustomColumnId ?? undefined,
        aggregationType: widget.aggregationType,
        entityFilters: widget.entityFilters,
        dealFilters: widget.dealFilters,
        displayOptions: widget.displayOptions ?? undefined,
        isTemplate: widget.isTemplate,
        ...updates,
      });

      if (!result.ok) return mcpInteractorFailure(result.error);

      return toonResult({
        id: result.data.id,
        kind: result.data.kind,
        name: result.data.name,
        message: `Widget "${result.data.name}" updated`,
      });
    }
    const parsed = DeleteWidgetSchema.safeParse(params);
    if (!parsed.success) return mcpValidationFailure(parsed.error);
    const widgetResult = await getGetWidgetByIdInteractor().invoke({
      id: parsed.data.id,
    });
    if (!widgetResult.ok) return mcpInteractorFailure(widgetResult.error);
    if (!widgetResult.data) return customMcpFailure(CustomErrorCode.widgetNotFound);
    const result = await getDeleteWidgetInteractor().invoke({
      id: parsed.data.id,
    });
    if (!result.ok) return mcpInteractorFailure(result.error);
    return {
      text: `Deleted widget ${parsed.data.id}`,
      structuredContent: { deleted: true, id: parsed.data.id },
    };
  },
};
