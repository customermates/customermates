import type { DiagramDataPoint } from "@/features/widget/widget.schema";

export type ChartDataPoint = DiagramDataPoint & {
  fill: string;
  color: string;
  labelColor: string;
  strokeColor: string;
};
