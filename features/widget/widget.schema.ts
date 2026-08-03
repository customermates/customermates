import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";
import { EntityType, WidgetGroupByType, AggregationType } from "@/generated/prisma";

import { CHIP_COLORS } from "@/constants/chip-colors";
import { FilterSchema } from "@/core/base/base-get.schema";

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

export const DiagramDataPointSchema = z.object({
  label: z.string(),
  value: z.number(),
  optionColor: z.enum(CHIP_COLORS).optional(),
});

export type DiagramDataPoint = Data<typeof DiagramDataPointSchema>;

export const WidgetDtoSchema = z.object({
  id: z.uuid(),
  userId: z.string(),
  companyId: z.string(),
  name: z.string(),
  entityType: z.enum(EntityType),
  entityFilters: z.array(FilterSchema),
  dealFilters: z.array(FilterSchema),
  displayOptions: WidgetDisplayOptionsSchema.nullable(),
  groupByType: z.enum(WidgetGroupByType),
  groupByCustomColumnId: z.string().nullable(),
  aggregationType: z.enum(AggregationType),
  layout: WidgetLayoutSchema.nullable(),
  data: z.array(DiagramDataPointSchema),
  isTemplate: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type WidgetDto = Data<typeof WidgetDtoSchema>;
