import { z } from "zod";
import type { Data } from "@/core/validation/validation.utils";

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
  number = "number",
  areaChart = "areaChart",
  rankedTable = "rankedTable",
  funnelChart = "funnelChart",
}

export const WidgetDisplayOptionsSchema = z.object({
  barColors: z.array(z.enum(ChartColor)).optional(),
  displayType: z
    .enum(DisplayType)
    .describe(
      "number shows the overall result and requires no grouping. areaChart plots a time series and requires groupBy.dateInterval. rankedTable lists groups by value with their share of the total and requires a grouping. funnelChart orders groups by the options of a single-choice grouping field with step-to-step conversion and requires one.",
    ),
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

export const WIDGET_BREAKPOINT_COLUMNS = { xs: 2, sm: 4, md: 8, lg: 12 } as const;
export const WIDGET_LAYOUT_MAX_ROW = 1000;
export const WIDGET_LAYOUT_MAX_ITEMS = 200;

export function widgetLayoutUpdateItemSchema(columns: number) {
  return z
    .object({
      i: z.uuid(),
      x: z
        .number()
        .int()
        .min(0)
        .max(columns - 1),
      y: z.number().int().min(0).max(WIDGET_LAYOUT_MAX_ROW),
      w: z.number().int().min(1).max(columns),
      h: z.number().int().min(1).max(WIDGET_LAYOUT_MAX_ROW),
    })
    .strict()
    .refine((item) => item.x + item.w <= columns, { path: ["w"], message: `x + w can be at most ${columns}` });
}

export const WidgetLayoutSchema = z.object({
  xs: WidgetLayoutItemSchema.optional(),
  sm: WidgetLayoutItemSchema.optional(),
  md: WidgetLayoutItemSchema.optional(),
  lg: WidgetLayoutItemSchema.optional(),
});

export type WidgetLayout = Data<typeof WidgetLayoutSchema>;
