import type { RecordActivityWidgetDto } from "./record-activity-widget.schema";
import { WidgetLayoutSchema, WidgetDisplayOptionsSchema } from "./widget-display.schema";
import { GenericRecordWidgetDtoSchema, type RecordWidgetDto } from "./record-widget.schema";
export {
  ChartColor,
  DisplayType,
  WidgetDisplayOptionsSchema,
  WidgetLayoutItemSchema,
  WidgetLayoutSchema,
} from "./widget-display.schema";
export type { WidgetDisplayOptions, WidgetLayout } from "./widget-display.schema";
import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";
import { EntityType, WidgetGroupByType, AggregationType, WidgetKind } from "@/generated/prisma";

import { CHIP_COLORS } from "@/constants/chip-colors";
import { FilterSchema } from "@/core/base/base-get.schema";
import { ActivityFiltersSchema } from "@/ee/messaging/activities/activities.schema";

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

export const LegacyWidgetDtoSchema = z.discriminatedUnion("kind", [ChartWidgetDtoSchema, ActivityWidgetDtoSchema]);

export const WidgetDtoSchema = z.union([GenericRecordWidgetDtoSchema, LegacyWidgetDtoSchema]);

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
  return widget.kind === WidgetKind.chart && !isRecordWidget(widget);
}

export function isActivityWidget(widget: WidgetDto): widget is ActivityWidgetDto {
  return widget.kind === WidgetKind.activityTimeline && !isRecordActivityWidget(widget);
}

export function isRecordWidget(widget: WidgetDto): widget is RecordWidgetDto {
  return widget.kind === WidgetKind.chart && "contractVersion" in widget && widget.contractVersion === 2;
}

export function isRecordActivityWidget(widget: WidgetDto): widget is RecordActivityWidgetDto {
  return widget.kind === "activityTimeline" && "contractVersion" in widget && widget.contractVersion === 2;
}
