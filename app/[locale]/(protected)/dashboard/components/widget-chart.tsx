"use client";

import type { ChipColor } from "@/constants/chip-colors";
import type { DiagramDataPoint, WidgetDisplayOptions } from "@/features/widget/widget.schema";
import type { ChartDataPoint } from "./chart.types";

import dynamic from "next/dynamic";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import type { AggregationType } from "@/generated/prisma";

import { ChartColor, DisplayType } from "@/features/widget/widget.schema";
import { getChartColors, getChartStrokeColors, getChartTextColors } from "@/constants/chart-colors";
import { widgetDataPointLabel } from "./widget-label";

const CHIP_TO_CHART_COLOR: Record<ChipColor, ChartColor> = {
  default: ChartColor.default1,
  secondary: ChartColor.secondary1,
  destructive: ChartColor.danger1,
  success: ChartColor.success1,
  warning: ChartColor.warning1,
  info: ChartColor.primary1,
};

const VerticalBarChart = dynamic(
  () =>
    import("./vertical-bar-chart").then((mod) => ({
      default: mod.VerticalBarChart,
    })),
  { ssr: false },
);
const HorizontalBarChart = dynamic(
  () =>
    import("./horizontal-bar-chart").then((mod) => ({
      default: mod.HorizontalBarChart,
    })),
  { ssr: false },
);
const VerticalBarChartWithLabels = dynamic(
  () =>
    import("./vertical-bar-chart-with-labels").then((mod) => ({
      default: mod.VerticalBarChartWithLabels,
    })),
  { ssr: false },
);
const HorizontalBarChartWithLabels = dynamic(
  () =>
    import("./horizontal-bar-chart-with-labels").then((mod) => ({
      default: mod.HorizontalBarChartWithLabels,
    })),
  { ssr: false },
);
const DoughnutChart = dynamic(() => import("./doughnut-chart").then((mod) => ({ default: mod.DoughnutChart })), {
  ssr: false,
});
const RadarChartComponent = dynamic(
  () =>
    import("./radar-chart").then((mod) => ({
      default: mod.RadarChartComponent,
    })),
  { ssr: false },
);

type Props = {
  aggregationType: AggregationType;
  data: DiagramDataPoint[];
  displayOptions?: WidgetDisplayOptions | null;
};

export const WidgetChart = observer(({ aggregationType, data, displayOptions }: Props) => {
  const t = useTranslations();
  const { resolvedTheme } = useTheme();
  const configuredBarColors = displayOptions?.barColors?.length ? displayOptions.barColors : [ChartColor.primary1];
  const useGroupColors = displayOptions?.useGroupColors !== false;
  const chartColors = getChartColors(resolvedTheme);
  const chartTextColors = getChartTextColors(resolvedTheme);
  const chartStrokeColors = getChartStrokeColors(resolvedTheme);
  const chartData: ChartDataPoint[] = data.map((item, index) => {
    const fallbackKey = configuredBarColors[index % configuredBarColors.length] ?? ChartColor.primary1;
    const colorKey = useGroupColors && item.optionColor ? CHIP_TO_CHART_COLOR[item.optionColor] : fallbackKey;

    return {
      label: widgetDataPointLabel(item, t),
      value: Number(item.value) || 0,
      fill: chartColors[colorKey],
      color: chartColors[colorKey],
      labelColor: chartTextColors[colorKey],
      strokeColor: chartStrokeColors[colorKey],
    };
  });
  const colors = useGroupColors
    ? chartData.map((point) => point.color)
    : configuredBarColors.map((color) => chartColors[color]);
  const displayType = displayOptions?.displayType ?? DisplayType.verticalBarChart;
  const commonProps = {
    aggregationType,
    chartData,
    colors,
    gridColor: "var(--border)",
    textColor: "var(--muted-foreground)",
    reverseXAxis: displayOptions?.reverseXAxis,
    reverseYAxis: displayOptions?.reverseYAxis,
  };
  const labelChartProps = {
    aggregationType,
    chartData,
    colors,
    textColor: "var(--muted-foreground)",
    reverseXAxis: displayOptions?.reverseXAxis,
    reverseYAxis: displayOptions?.reverseYAxis,
  };

  switch (displayType) {
    case DisplayType.horizontalBarChart:
      return <HorizontalBarChart {...commonProps} />;
    case DisplayType.verticalBarChartWithLabels:
      return <VerticalBarChartWithLabels {...labelChartProps} />;
    case DisplayType.horizontalBarChartWithLabels:
      return <HorizontalBarChartWithLabels {...labelChartProps} />;
    case DisplayType.doughnutChart:
      return <DoughnutChart {...commonProps} showLegend={displayOptions?.showLegend !== false} />;
    case DisplayType.radarChart:
      return <RadarChartComponent {...commonProps} />;
    default:
      return <VerticalBarChart {...commonProps} />;
  }
});
