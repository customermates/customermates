import { z } from "zod";
import { EntityType, WidgetGroupByType, AggregationType } from "@/generated/prisma";

import { encodeToToon, enumHint, FILTER_FIELD_DESCRIPTION } from "./utils";

import {
  getUpsertWidgetInteractor,
  getGetWidgetsInteractor,
  getGetWidgetByIdInteractor,
  getDeleteWidgetInteractor,
} from "@/core/app-di";
import { type UpsertWidgetData } from "@/features/widget/upsert-widget.interactor";
import { ChartColor, DisplayType } from "@/features/widget/widget.types";
import { FilterSchema } from "@/core/base/base-get.schema";

const entityTypeValues = Object.values(EntityType);
const groupByValues = Object.values(WidgetGroupByType);
const aggregationValues = Object.values(AggregationType);
const displayTypeValues = Object.values(DisplayType);
const chartColorValues = Object.values(ChartColor);

const CreateWidgetSchema = z.object({
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
});

const UpdateWidgetSchema = z.object({
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
});

const GetWidgetsSchema = z.object({
  ids: z.array(z.uuid()).min(1).describe("Widget ids to fetch"),
});

const DeleteWidgetSchema = z.object({
  id: z.uuid().describe("Widget id"),
});

export const listWidgetsTool = {
  name: "list_widgets",
  description: "List every dashboard widget. Returns { id, name } pairs. No arguments.",
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  inputSchema: z.object({}),
  execute: async () => {
    const result = (await getGetWidgetsInteractor().invoke()) as
      | { ok: true; data: Array<{ id: string; name: string }> }
      | { ok: false; error: z.ZodError };
    if (!result.ok) return `Validation error: ${z.prettifyError(result.error)}`;
    const widgets = result.data;
    return encodeToToon({
      items: widgets.map((widget) => ({ id: widget.id, name: widget.name })),
      total: widgets.length,
    });
  },
};

export const getWidgetsTool = {
  name: "get_widgets",
  description:
    "Fetch full configuration for one or more widgets by id. " +
    "Required: ids. " +
    "Use this before update_widget when you need the current groupBy / filters / displayOptions.",
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  inputSchema: GetWidgetsSchema,
  execute: async ({ ids }: z.infer<typeof GetWidgetsSchema>) => {
    const results = await Promise.all(
      ids.map(async (id) => {
        const result = await getGetWidgetByIdInteractor().invoke({ id });
        const widget = result.data;
        if (!widget) return { error: `Widget ${id} not found` };
        return {
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
        };
      }),
    );
    return encodeToToon(results);
  },
};

export const createWidgetTool = {
  name: "create_widget",
  description:
    "Create a dashboard widget. " +
    "Required: name, entityType, displayType, groupByType, aggregationType. " +
    "Optional: groupByCustomColumnId (required when groupByType is customColumn), entityFilters, dealFilters. " +
    "Returns the new widget id and name.",
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  inputSchema: CreateWidgetSchema,
  execute: async (params: z.infer<typeof CreateWidgetSchema>) => {
    const payload = {
      name: params.name,
      entityType: params.entityType,
      groupByType: params.groupByType,
      groupByCustomColumnId: params.groupByCustomColumnId,
      aggregationType: params.aggregationType,
      entityFilters: Array.isArray(params.entityFilters) ? params.entityFilters : [],
      dealFilters: Array.isArray(params.dealFilters) ? params.dealFilters : [],
      displayOptions: {
        displayType: params.displayType,
        reverseXAxis: false,
        reverseYAxis: false,
        barColors: [ChartColor.primary1, ChartColor.primary2],
      },
      isTemplate: false,
    };
    const result = await getUpsertWidgetInteractor().invoke(payload);
    if (!result.ok) return `Validation error: ${z.prettifyError(result.error)}`;

    return encodeToToon({
      id: result.data.id,
      name: result.data.name,
      message: `Widget "${result.data.name}" created successfully`,
    });
  },
};

export const updateWidgetTool = {
  name: "update_widget",
  description:
    "Partial update for one widget. " +
    "Required: id. All other fields optional; only provided fields change. " +
    "WARNING: entityFilters and dealFilters REPLACE the existing filter arrays. " +
    "Idempotent: same payload produces the same state.",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  inputSchema: UpdateWidgetSchema,
  execute: async (params: z.infer<typeof UpdateWidgetSchema>) => {
    const widgetResult = await getGetWidgetByIdInteractor().invoke({ id: params.id });
    const widget = widgetResult.data;
    if (!widget) return `Validation error: Widget ${params.id} not found`;

    const displayOptionsChanged =
      params.displayType !== undefined ||
      params.reverseXAxis !== undefined ||
      params.reverseYAxis !== undefined ||
      params.barColors !== undefined;

    const updates: Partial<Omit<UpsertWidgetData, "id">> = {};
    if (params.name !== undefined) updates.name = params.name;
    if (params.groupByType !== undefined) updates.groupByType = params.groupByType;
    if (params.groupByCustomColumnId !== undefined) updates.groupByCustomColumnId = params.groupByCustomColumnId;
    if (params.aggregationType !== undefined) updates.aggregationType = params.aggregationType;
    if (Array.isArray(params.entityFilters)) updates.entityFilters = params.entityFilters;
    if (Array.isArray(params.dealFilters)) updates.dealFilters = params.dealFilters;
    if (displayOptionsChanged) {
      updates.displayOptions = {
        displayType: params.displayType ?? widget.displayOptions.displayType,
        reverseXAxis: params.reverseXAxis ?? widget.displayOptions.reverseXAxis,
        reverseYAxis: params.reverseYAxis ?? widget.displayOptions.reverseYAxis,
        barColors: params.barColors ?? widget.displayOptions.barColors,
      };
    }

    const result = await getUpsertWidgetInteractor().invoke({
      id: params.id,
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
      message: `Widget "${result.data.name}" updated`,
    });
  },
};

export const deleteWidgetTool = {
  name: "delete_widget",
  description: "IRREVERSIBLE. Delete a widget by id. Required: id.",
  annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  inputSchema: DeleteWidgetSchema,
  execute: async ({ id }: z.infer<typeof DeleteWidgetSchema>) => {
    const result = (await getDeleteWidgetInteractor().invoke({ id })) as
      | { ok: true; data: unknown }
      | { ok: false; error: z.ZodError };
    if (!result.ok) return `Validation error: ${z.prettifyError(result.error)}`;
    return `Deleted widget ${id}`;
  },
};
