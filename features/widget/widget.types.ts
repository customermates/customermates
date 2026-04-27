import type { LayoutsData } from "./update-widget-layouts.interactor";
import type { DisplayOptions } from "./upsert-widget.interactor";
import type { ChipColor } from "@/constants/chip-colors";
import type { Breakpoint } from "@/core/types/breakpoint";
import type { Filter } from "@/core/base/base-get.schema";

import type { WidgetGroupByType, Widget } from "@/generated/prisma";

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

export type WidgetGroupBy = {
  groupByType: WidgetGroupByType;
  groupByCustomColumnId?: string;
};

export type ExtendedWidget = Widget & {
  data: DiagramDataPoint[];
  displayOptions: DisplayOptions;
  entityFilters: Filter[];
  dealFilters?: Filter[];
  layout: WidgetLayout;
};

export type WidgetLayout = {
  [K in Breakpoint]: LayoutsData[K][number] | undefined;
};

export type DiagramDataPoint = {
  label: string;
  value: number;
  optionColor?: ChipColor;
};
