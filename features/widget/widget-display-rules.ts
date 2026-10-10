import type { RecordMeasure } from "@/features/records/record-measure.schema";
import type { RecordModelView } from "@/features/records/record-model.schema";

import { DisplayType } from "./widget-display.schema";

export const WIDGET_STARTER_DISPLAY_TYPES = [
  DisplayType.number,
  DisplayType.verticalBarChart,
  DisplayType.horizontalBarChart,
  DisplayType.areaChart,
  DisplayType.rankedTable,
  DisplayType.doughnutChart,
  DisplayType.funnelChart,
  DisplayType.radarChart,
] as const;

export const WIDGET_DISPLAY_REQUIREMENTS = ["noGrouping", "grouping", "timeInterval", "singleChoice"] as const;
export type WidgetDisplayRequirement = (typeof WIDGET_DISPLAY_REQUIREMENTS)[number];

type DisplayModel = Pick<RecordModelView, "fields" | "relationships">;

function measureGroupField(measure: RecordMeasure, model: DisplayModel) {
  let typeId = measure.source.typeId;
  for (const step of measure.groupBy?.path ?? []) {
    const relation = model.relationships.find((relation) => relation.id === step.relationId);
    if (!relation) return undefined;
    typeId = step.direction === "outgoing" ? relation.targetTypeId : relation.sourceTypeId;
  }
  return model.fields.find(
    (field) => field.id === measure.groupBy?.fieldId && field.typeId === typeId && !field.archived,
  );
}

export function widgetDisplayRequirement(displayType: DisplayType): WidgetDisplayRequirement | null {
  if (displayType === DisplayType.number) return "noGrouping";
  if (displayType === DisplayType.areaChart) return "timeInterval";
  if (displayType === DisplayType.rankedTable) return "grouping";
  if (displayType === DisplayType.funnelChart) return "singleChoice";
  return null;
}

export function widgetDisplayTypeIssue(
  displayType: DisplayType,
  measure: RecordMeasure,
  model: DisplayModel | null | undefined,
): WidgetDisplayRequirement | null {
  const requirement = widgetDisplayRequirement(displayType);
  const groupBy = measure.groupBy;
  if (requirement === "noGrouping") return groupBy ? requirement : null;
  if (requirement === "grouping") return groupBy ? null : requirement;
  if (requirement === "timeInterval") return groupBy?.dateInterval ? null : requirement;
  if (requirement === "singleChoice") {
    if (!groupBy?.fieldId || groupBy.dateInterval || !model) return requirement;
    const field = measureGroupField(measure, model);
    return field?.valueType === "select" && !field.multiple ? null : requirement;
  }
  return null;
}
