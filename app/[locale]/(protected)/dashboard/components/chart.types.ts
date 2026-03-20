import type { DiagramDataPoint } from "@/features/widget/widget.types";

export type ChartDataPoint = DiagramDataPoint & {
  fill: string;
  color: string;
  labelColor: string;
  strokeColor: string;
};
