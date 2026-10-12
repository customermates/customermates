"use client";

import type { ChipColor } from "@/constants/chip-colors";
import type { DiagramDataPoint, WidgetDisplayOptions } from "@/features/widget/widget.schema";
import type { ChartDataPoint } from "./chart.types";

import dynamic from "next/dynamic";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";

import { ChartColor, DisplayType } from "@/features/widget/widget.schema";
import { getChartColors, getChartRankShades, getChartStrokeColors, getChartTextColors } from "@/constants/chart-colors";
import { widgetDataPointLabel } from "./widget-label";

const CHIP_TO_CHART_COLOR: Record<ChipColor, ChartColor> = {
  default: ChartColor.default1,
  secondary: ChartColor.secondary1,
  destructive: ChartColor.danger1,
  success: ChartColor.success1,
  warning: ChartColor.warning1,
  info: ChartColor.primary1,
};

const RANK_SHADED_TYPES = new Set<DisplayType>([
  DisplayType.verticalBarChart,
  DisplayType.horizontalBarChart,
  DisplayType.verticalBarChartWithLabels,
  DisplayType.horizontalBarChartWithLabels,
  DisplayType.funnelChart,
  DisplayType.doughnutChart,
]);

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
const AreaTimeChart = dynamic(() => import("./area-time-chart").then((mod) => ({ default: mod.AreaTimeChart })), {
  ssr: false,
});
const FunnelChart = dynamic(() => import("./funnel-chart").then((mod) => ({ default: mod.FunnelChart })), {
  ssr: false,
});
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
  currency?: string | null;
  data: (DiagramDataPoint & { formattedValue?: string; axisLabel?: string; detail?: string; missing?: boolean })[];
  displayOptions?: WidgetDisplayOptions | null;
  integerValues?: boolean;
  shadeByRank?: boolean;
};

export const WidgetChart = observer(
  ({ data, displayOptions, currency, integerValues = false, shadeByRank = true }: Props) => {
    const t = useTranslations();
    const { resolvedTheme } = useTheme();
    const configuredBarColors = displayOptions?.barColors?.length ? displayOptions.barColors : [ChartColor.primary1];
    const useGroupColors = displayOptions?.useGroupColors !== false;
    const chartColors = getChartColors(resolvedTheme);
    const chartTextColors = getChartTextColors(resolvedTheme);
    const chartStrokeColors = getChartStrokeColors(resolvedTheme);
    const displayType = displayOptions?.displayType ?? DisplayType.verticalBarChart;
    const singleColor = configuredBarColors.length === 1 && !(useGroupColors && data.some((item) => item.optionColor));
    const shades =
      shadeByRank && singleColor && RANK_SHADED_TYPES.has(displayType)
        ? getChartRankShades(
            configuredBarColors[0],
            resolvedTheme,
            data.map((item) => item.value),
          )
        : null;
    const chartData: ChartDataPoint[] = data.map((item, index) => {
      const fallbackKey = configuredBarColors[index % configuredBarColors.length] ?? ChartColor.primary1;
      const colorKey = useGroupColors && item.optionColor ? CHIP_TO_CHART_COLOR[item.optionColor] : fallbackKey;

      return {
        label: widgetDataPointLabel(item, t),
        value: item.value,
        formattedValue: item.formattedValue,
        axisLabel: item.axisLabel,
        detail: item.detail,
        missing: item.missing,
        fill: shades?.[index] ?? chartColors[colorKey],
        color: shades?.[index] ?? chartColors[colorKey],
        labelColor: chartTextColors[colorKey],
        strokeColor: chartStrokeColors[colorKey],
      };
    });
    const colors =
      useGroupColors || shades
        ? chartData.map((point) => point.color)
        : configuredBarColors.map((color) => chartColors[color]);
    const commonProps = {
      currency,
      chartData,
      colors,
      reverseXAxis: displayOptions?.reverseXAxis,
      reverseYAxis: displayOptions?.reverseYAxis,
      allowDecimals: !integerValues,
    };
    const labelChartProps = {
      currency,
      chartData,
      colors,
      reverseXAxis: displayOptions?.reverseXAxis,
      reverseYAxis: displayOptions?.reverseYAxis,
    };

    switch (displayType) {
      case DisplayType.areaChart:
        return (
          <AreaTimeChart
            {...commonProps}
            colors={configuredBarColors.map((color) => chartColors[color])}
            strokeColors={configuredBarColors.map((color) => chartStrokeColors[color])}
          />
        );
      case DisplayType.funnelChart:
        return <FunnelChart chartData={chartData} />;
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
  },
);
