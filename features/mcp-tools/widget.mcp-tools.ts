import { z } from "zod";
import { EntityType, WidgetGroupByType, AggregationType } from "@/generated/prisma";

import { encodeToToon } from "./utils";

import { getUpsertWidgetInteractor, getGetWidgetsInteractor, getGetWidgetByIdInteractor } from "@/core/di";
import { type UpsertWidgetData } from "@/features/widget/upsert-widget.interactor";
import { ChartColor, DisplayType } from "@/features/widget/widget.types";
import { FilterSchema } from "@/core/base/base-get.schema";

const GetWidgetsSchema = z.object({});

const GetWidgetDetailsSchema = z.object({
  id: z.uuid().describe("Widget ID"),
});

const UpdateWidgetGroupingSchema = z.object({
  id: z.uuid().describe("Widget ID"),
  groupByType: z.enum(WidgetGroupByType).describe("How to group the data"),
  groupByCustomColumnId: z
    .uuid()
    .optional()
    .describe("Custom column ID to group by (required if groupByType is customColumn)"),
});

const UpdateWidgetAggregationSchema = z.object({
  id: z.uuid().describe("Widget ID"),
  aggregationType: z
    .enum(AggregationType)
    .describe(
      "How to aggregate the data. Either the count of the entities or the sum of the deal values related to the entities or the sum of the deal quantities related to the entities.",
    ),
});

const UpdateWidgetEntityFiltersSchema = z.object({
  id: z.uuid().describe("Widget ID"),
  entityFilters: z.array(FilterSchema).describe("Filters to apply to the entity"),
});

const UpdateWidgetDealFiltersSchema = z.object({
  id: z.uuid().describe("Widget ID"),
  dealFilters: z.array(FilterSchema).describe("Filters to apply to deals (not allowed for deal entities)"),
});

const UpdateWidgetDisplayOptionsSchema = z.object({
  id: z.uuid().describe("Widget ID"),
  displayType: z.enum(DisplayType).optional().describe("Type of the chart"),
  reverseXAxis: z.boolean().optional().describe("Reverse the X axis"),
  reverseYAxis: z.boolean().optional().describe("Reverse the Y axis"),
  barColors: z.array(z.enum(ChartColor)).optional().describe("Bar colors for the chart"),
});

const CreateWidgetSchema = z.object({
  name: z.string().min(1).describe("Name of the widget"),
  entityType: z.enum(EntityType).describe("Entity type to create widget for"),
  entityFilters: z.array(FilterSchema).optional().describe("Filters to apply to the entity"),
  dealFilters: z.array(FilterSchema).optional().describe("Filters to apply to deals (not allowed for deal entities)"),
  displayType: z.enum(DisplayType).describe("Type of the chart"),
  groupByType: z.enum(WidgetGroupByType).describe("How to group the data"),
  groupByCustomColumnId: z
    .uuid()
    .optional()
    .describe("Custom column ID to group by (required if groupByType is customColumn)"),
  aggregationType: z
    .enum(AggregationType)
    .describe(
      "How to aggregate the data. Either the count of the entities or the sum of the deal values related to the entities or the sum of the deal quantities related to the entities.",
    ),
});

export const getWidgetsTool = {
  name: "get_widgets",
  description: "Get all dashboard widgets with their IDs and names.",
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  inputSchema: GetWidgetsSchema,
  execute: async () => {
    const result = await getGetWidgetsInteractor().invoke();
    const widgets = result.data;
    return encodeToToon({
      items: widgets.map((widget) => ({ id: widget.id, name: widget.name })),
      total: widgets.length,
    });
  },
};

export const batchGetWidgetDetailsTool = {
  name: "batch_get_widget_details",
  description: "Get complete details of widgets by IDs.",
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  inputSchema: GetWidgetDetailsSchema,
  execute: async (params: z.infer<typeof GetWidgetDetailsSchema>) => {
    const widgetResult = await getGetWidgetByIdInteractor().invoke({ id: params.id });
    const widget = widgetResult.data;
    if (!widget) return `Validation error: Widget with ID ${params.id} not found`;

    return encodeToToon({
      id: widget.id,
      name: widget.name,
      entityType: widget.entityType,
      groupByType: widget.groupByType,
      groupByCustomColumnId: widget.groupByCustomColumnId,
      aggregationType: widget.aggregationType,
      entityFilters: widget.entityFilters,
      dealFilters: widget.dealFilters,
      displayOptions: widget.displayOptions,
      isTemplate: widget.isTemplate,
    });
  },
};

export const updateWidgetGroupingTool = {
  name: "update_widget_grouping",
  description: "Update widget grouping configuration (groupByType and groupByCustomColumnId).",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  inputSchema: UpdateWidgetGroupingSchema,
  execute: async (params: z.infer<typeof UpdateWidgetGroupingSchema>) => {
    return updateWidget(
      params.id,
      {
        groupByType: params.groupByType,
        groupByCustomColumnId: params.groupByCustomColumnId,
      },
      'Widget "{name}" grouping updated successfully',
    );
  },
};

export const updateWidgetAggregationTool = {
  name: "update_widget_aggregation",
  description: "Update widget aggregation type.",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  inputSchema: UpdateWidgetAggregationSchema,
  execute: async (params: z.infer<typeof UpdateWidgetAggregationSchema>) => {
    return updateWidget(
      params.id,
      { aggregationType: params.aggregationType },
      'Widget "{name}" aggregation updated successfully',
    );
  },
};

export const updateWidgetEntityFiltersTool = {
  name: "update_widget_entity_filters",
  description: "Update widget entity filters.",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  inputSchema: UpdateWidgetEntityFiltersSchema,
  execute: async (params: z.infer<typeof UpdateWidgetEntityFiltersSchema>) => {
    return updateWidget(
      params.id,
      { entityFilters: params.entityFilters },
      'Widget "{name}" entity filters updated successfully',
    );
  },
};

export const updateWidgetDealFiltersTool = {
  name: "update_widget_deal_filters",
  description: "Update widget deal filters (not allowed for deal entity type).",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  inputSchema: UpdateWidgetDealFiltersSchema,
  execute: async (params: z.infer<typeof UpdateWidgetDealFiltersSchema>) => {
    return updateWidget(
      params.id,
      { dealFilters: params.dealFilters },
      'Widget "{name}" deal filters updated successfully',
    );
  },
};

export const updateWidgetDisplayOptionsTool = {
  name: "update_widget_display_options",
  description: "Update widget display options (chart type, axis reversal, colors).",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  inputSchema: UpdateWidgetDisplayOptionsSchema,
  execute: async (params: z.infer<typeof UpdateWidgetDisplayOptionsSchema>) => {
    const widgetResult = await getGetWidgetByIdInteractor().invoke({ id: params.id });
    const widget = widgetResult.data;
    if (!widget) return `Validation error: Widget with ID ${params.id} not found`;

    return updateWidget(
      params.id,
      {
        displayOptions: {
          displayType: params.displayType ?? widget.displayOptions.displayType,
          reverseXAxis: params.reverseXAxis ?? widget.displayOptions.reverseXAxis,
          reverseYAxis: params.reverseYAxis ?? widget.displayOptions.reverseYAxis,
          barColors: params.barColors ?? widget.displayOptions.barColors,
        },
      },
      'Widget "{name}" display options updated successfully',
    );
  },
};

export const createWidgetTool = {
  name: "create_widget",
  description: "Create a dashboard widget (chart/statistic). Returns widget ID.",
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  inputSchema: CreateWidgetSchema,
  execute: async (params: z.infer<typeof CreateWidgetSchema>) => {
    const result = await getUpsertWidgetInteractor().invoke({
      name: params.name,
      entityType: params.entityType,
      groupByType: params.groupByType,
      groupByCustomColumnId: params.groupByCustomColumnId,
      aggregationType: params.aggregationType,
      entityFilters: params.entityFilters,
      dealFilters: params.dealFilters,
      displayOptions: {
        displayType: params.displayType,
        reverseXAxis: false,
        reverseYAxis: false,
        barColors: [ChartColor.primary1, ChartColor.primary2],
      },
      isTemplate: false,
    });

    if (!result.ok) return `Validation error: ${z.prettifyError(result.error)}`;

    return encodeToToon({
      id: result.data.id,
      name: result.data.name,
      message: `Widget "${result.data.name}" created successfully`,
    });
  },
};

async function updateWidget(
  id: string,
  updates: Partial<Omit<UpsertWidgetData, "id">>,
  successMessage: string,
): Promise<string> {
  const widgetResult = await getGetWidgetByIdInteractor().invoke({ id });
  const widget = widgetResult.data;
  if (!widget) return `Validation error: Widget with ID ${id} not found`;

  const result = await getUpsertWidgetInteractor().invoke({
    id,
    name: widget.name,
    entityType: widget.entityType,
    groupByType: widget.groupByType,
    groupByCustomColumnId: widget.groupByCustomColumnId ?? undefined,
    aggregationType: widget.aggregationType,
    entityFilters: widget.entityFilters,
    dealFilters: widget.dealFilters,
    displayOptions: widget.displayOptions,
    isTemplate: widget.isTemplate,
    ...updates,
  });

  if (!result.ok) return `Validation error: ${z.prettifyError(result.error)}`;

  return encodeToToon({
    id: result.data.id,
    name: result.data.name,
    message: successMessage.replace("{name}", result.data.name),
  });
}
