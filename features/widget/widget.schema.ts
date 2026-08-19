import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";
import { EntityType, WidgetGroupByType, AggregationType, WidgetKind } from "@/generated/prisma";

import { CHIP_COLORS } from "@/constants/chip-colors";
import { FilterSchema } from "@/core/base/base-get.schema";
import { ActivityFiltersSchema } from "@/ee/messaging/activities/activities.schema";

export enum ChartColor {
  default1 = "default1",
  default2 = "default2",
  default3 = "default3",
  primary1 = "primary1",
  primary2 = "primary2",
  primary3 = "primary3",
  secondary1 = "secondary1",
  secondary2 = "secondary2",
  secondary3 = "secondary3",
  success1 = "success1",
  success2 = "success2",
  success3 = "success3",
  warning1 = "warning1",
  warning2 = "warning2",
  warning3 = "warning3",
  danger1 = "danger1",
  danger2 = "danger2",
  danger3 = "danger3",
}

export enum DisplayType {
  verticalBarChart = "verticalBarChart",
  horizontalBarChart = "horizontalBarChart",
  verticalBarChartWithLabels = "verticalBarChartWithLabels",
  horizontalBarChartWithLabels = "horizontalBarChartWithLabels",
  doughnutChart = "doughnutChart",
  radarChart = "radarChart",
}

export const CompanyWidgetSchema = z.object({
  id: z.string(),
  kind: z.enum(WidgetKind),
  name: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  avatarUrl: z.string().nullable(),
});

export type CompanyWidget = Data<typeof CompanyWidgetSchema>;

export const CompanyWidgetsResultSchema = z.object({
  widgets: z.array(CompanyWidgetSchema),
});

export const WidgetDisplayOptionsSchema = z.object({
  barColors: z.array(z.enum(ChartColor)).optional(),
  displayType: z.enum(DisplayType),
  reverseXAxis: z.boolean().optional(),
  reverseYAxis: z.boolean().optional(),
  useGroupColors: z.boolean().optional(),
  showLegend: z.boolean().optional(),
  showFilters: z.boolean().optional(),
});

export type WidgetDisplayOptions = Data<typeof WidgetDisplayOptionsSchema>;

export const WidgetLayoutItemSchema = z.object({
  i: z.string(),
  x: z.number(),
  y: z.number().nullish(),
  w: z.number(),
  h: z.number(),
  minW: z.number().optional(),
  maxW: z.number().optional(),
  minH: z.number().optional(),
  maxH: z.number().optional(),
});

export const WidgetLayoutSchema = z.object({
  xs: WidgetLayoutItemSchema.optional(),
  sm: WidgetLayoutItemSchema.optional(),
  md: WidgetLayoutItemSchema.optional(),
  lg: WidgetLayoutItemSchema.optional(),
});

export type WidgetLayout = Data<typeof WidgetLayoutSchema>;

export const DIAGRAM_SYSTEM_LABEL_KEYS = ["noGroup", "total"] as const;

const DiagramDataPointFields = {
  value: z.number(),
  optionColor: z.enum(CHIP_COLORS).optional(),
};

export const DiagramDataPointSchema = z.discriminatedUnion("labelKind", [
  z.object({ labelKind: z.literal("literal"), label: z.string().min(1), ...DiagramDataPointFields }).strict(),
  z
    .object({
      labelKind: z.literal("system"),
      systemLabelKey: z.enum(DIAGRAM_SYSTEM_LABEL_KEYS),
      ...DiagramDataPointFields,
    })
    .strict(),
]);

export type DiagramDataPoint = Data<typeof DiagramDataPointSchema>;

export const ActivityWidgetDisplayOptionsSchema = z.object({
  showFilters: z.boolean().optional(),
});

export type ActivityWidgetDisplayOptions = Data<typeof ActivityWidgetDisplayOptionsSchema>;

const WidgetBaseDtoSchema = z.object({
  id: z.uuid(),
  userId: z.string(),
  companyId: z.string(),
  name: z.string(),
  layout: WidgetLayoutSchema.nullable(),
  isTemplate: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const ChartWidgetDtoSchema = WidgetBaseDtoSchema.extend({
  kind: z.literal(WidgetKind.chart),
  entityType: z.enum(EntityType),
  entityFilters: z.array(FilterSchema),
  dealFilters: z.array(FilterSchema),
  displayOptions: WidgetDisplayOptionsSchema.nullable(),
  groupByType: z.enum(WidgetGroupByType),
  groupByCustomColumnId: z.string().nullable(),
  aggregationType: z.enum(AggregationType),
  data: z.array(DiagramDataPointSchema),
});

export type ChartWidgetDto = Data<typeof ChartWidgetDtoSchema>;

export const ActivityWidgetDtoSchema = WidgetBaseDtoSchema.extend({
  kind: z.literal(WidgetKind.activityTimeline),
  timelineFilters: ActivityFiltersSchema,
  displayOptions: ActivityWidgetDisplayOptionsSchema.nullable(),
});

export type ActivityWidgetDto = Data<typeof ActivityWidgetDtoSchema>;

export const WidgetDtoSchema = z.discriminatedUnion("kind", [ChartWidgetDtoSchema, ActivityWidgetDtoSchema]);

export type WidgetDto = Data<typeof WidgetDtoSchema>;

export function supportsDealFilters({
  aggregationType,
  entityType,
}: {
  aggregationType: AggregationType;
  entityType: EntityType;
}) {
  return (
    entityType !== EntityType.deal &&
    (aggregationType === AggregationType.dealValue ||
      aggregationType === AggregationType.dealQuantity ||
      aggregationType === AggregationType.dealWeightedValue)
  );
}

export function isChartWidget(widget: WidgetDto): widget is ChartWidgetDto {
  return widget.kind === WidgetKind.chart;
}

export function isActivityWidget(widget: WidgetDto): widget is ActivityWidgetDto {
  return widget.kind === WidgetKind.activityTimeline;
}
