import { z } from "zod";
import { EntityType, WidgetGroupByType, AggregationType } from "@/generated/prisma";

import {
  encodeToToon,
  validationError,
  runInteractor,
  customErrorMessage,
  enumHint,
  formatDatesInResponse,
  FILTER_FIELD_DESCRIPTION,
} from "./utils";

import {
  getUpsertWidgetInteractor,
  getGetWidgetsInteractor,
  getGetWidgetByIdInteractor,
  getDeleteWidgetInteractor,
} from "@/core/di";
import { type UpsertWidgetData } from "@/features/widget/upsert-widget.interactor";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { ChartColor, DisplayType } from "@/features/widget/widget.schema";
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
  ids: z.array(z.uuid()).min(1).max(100).describe("Widget ids to fetch"),
});

const DeleteWidgetSchema = z.object({
  id: z.uuid().describe("Widget id"),
});

const ManageWidgetsSchema = z.object({
  action: z
    .enum(["create", "update", "delete", "get", "list"])
    .describe("list = ids and names, get = full config with computed data, create/update/delete = manage widgets"),
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
});

export const manageWidgetsTool = {
  name: "manage_widgets",
  title: "Manage widgets",
  description:
    "Use this when you need to create, update, delete, or read dashboard widgets. " +
    "action list returns { id, name } pairs. " +
    "action get takes ids and returns each widget's full configuration INCLUDING its computed data points (label and value per group), so it answers questions like total pipeline value by stage in one call. " +
    "action create requires name, entityType, displayType, groupByType, aggregationType. " +
    "action update requires id; only provided fields change, but entityFilters and dealFilters REPLACE the existing arrays. " +
    "action delete is IRREVERSIBLE.",
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  inputSchema: ManageWidgetsSchema,
  execute: async (params: z.infer<typeof ManageWidgetsSchema>) => {
    if (params.action === "list") {
      const result = await getGetWidgetsInteractor().invoke();
      const widgets = result.data;
      return encodeToToon({
        items: widgets.map((widget) => ({ id: widget.id, name: widget.name })),
        total: widgets.length,
      });
    }
    if (params.action === "get") {
      const parsed = GetWidgetsSchema.safeParse(params);
      if (!parsed.success) return validationError(parsed.error);
      const results = await Promise.all(
        parsed.data.ids.map(async (id) => {
          const result = await getGetWidgetByIdInteractor().invoke({ id });
          if (!result.ok) return { error: validationError(result.error) };
          const widget = result.data;
          if (!widget) return { error: await customErrorMessage(CustomErrorCode.widgetNotFound) };
          return widget;
        }),
      );
      return encodeToToon(formatDatesInResponse(results));
    }
    if (params.action === "create") {
      const parsed = CreateWidgetSchema.safeParse(params);
      if (!parsed.success) return validationError(parsed.error);
      const createParams = parsed.data;
      const payload = {
        name: createParams.name,
        entityType: createParams.entityType,
        groupByType: createParams.groupByType,
        groupByCustomColumnId: createParams.groupByCustomColumnId,
        aggregationType: createParams.aggregationType,
        entityFilters: Array.isArray(createParams.entityFilters) ? createParams.entityFilters : [],
        dealFilters: Array.isArray(createParams.dealFilters) ? createParams.dealFilters : [],
        displayOptions: {
          displayType: createParams.displayType,
          reverseXAxis: false,
          reverseYAxis: false,
          barColors: [ChartColor.primary1, ChartColor.primary2],
        },
        isTemplate: false,
      };
      return runInteractor(getUpsertWidgetInteractor().invoke(payload), (data) =>
        encodeToToon({ id: data.id, name: data.name, message: `Widget "${data.name}" created successfully` }),
      );
    }
    if (params.action === "update") {
      const parsed = UpdateWidgetSchema.safeParse(params);
      if (!parsed.success) return validationError(parsed.error);
      const updateParams = parsed.data;
      const widgetResult = await getGetWidgetByIdInteractor().invoke({ id: updateParams.id });
      if (!widgetResult.ok) return validationError(widgetResult.error);
      const widget = widgetResult.data;
      if (!widget) return await customErrorMessage(CustomErrorCode.widgetNotFound);

      const displayOptionsChanged =
        updateParams.displayType !== undefined ||
        updateParams.reverseXAxis !== undefined ||
        updateParams.reverseYAxis !== undefined ||
        updateParams.barColors !== undefined;

      const updates: Partial<Omit<UpsertWidgetData, "id">> = {};
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

      if (!result.ok) return validationError(result.error);

      return encodeToToon({
        id: result.data.id,
        name: result.data.name,
        message: `Widget "${result.data.name}" updated`,
      });
    }
    const parsed = DeleteWidgetSchema.safeParse(params);
    if (!parsed.success) return validationError(parsed.error);
    const widgetResult = await getGetWidgetByIdInteractor().invoke({ id: parsed.data.id });
    if (!widgetResult.ok) return validationError(widgetResult.error);
    if (!widgetResult.data) return await customErrorMessage(CustomErrorCode.widgetNotFound);
    const result = await getDeleteWidgetInteractor().invoke({ id: parsed.data.id });
    if (!result.ok) return validationError(result.error);
    return `Deleted widget ${parsed.data.id}`;
  },
};
