import type { DiagramDataPoint } from "@/features/widget/widget.schema";

export function widgetDataPointLabel(item: DiagramDataPoint, translate: (key: string) => string): string {
  return item.labelKind === "literal" ? item.label : translate(`Diagrams.${item.systemLabelKey}`);
}
