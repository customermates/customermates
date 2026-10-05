import type { Data } from "@/core/validation/validation.utils";
import type { RecordActivityWidgetDto } from "./record-activity-widget.schema";
import { GenericRecordWidgetDtoSchema, type RecordWidgetDto } from "./record-widget.schema";
export {
  ChartColor,
  DisplayType,
  WidgetDisplayOptionsSchema,
  WidgetLayoutItemSchema,
  WidgetLayoutSchema,
} from "./widget-display.schema";
export type { WidgetDisplayOptions, WidgetLayout } from "./widget-display.schema";

import { WidgetKind } from "@/generated/prisma";
import { z } from "zod";

import { CHIP_COLORS } from "@/constants/chip-colors";

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

export const WidgetDtoSchema = GenericRecordWidgetDtoSchema;
export type WidgetDto = Data<typeof WidgetDtoSchema>;

export function isRecordWidget(widget: WidgetDto): widget is RecordWidgetDto {
  return widget.kind === WidgetKind.chart;
}

export function isRecordActivityWidget(widget: WidgetDto): widget is RecordActivityWidgetDto {
  return widget.kind === "activityTimeline";
}
