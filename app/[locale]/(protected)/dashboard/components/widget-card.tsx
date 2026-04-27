"use client";

import type { ChartDataPoint } from "./chart.types";
import type { ExtendedWidget } from "@/features/widget/widget.types";
import type { ChipColor } from "@/constants/chip-colors";

import React, { useMemo } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import dynamic from "next/dynamic";

import { AggregationType } from "@/generated/prisma";

import { ChartColor, DisplayType } from "@/features/widget/widget.types";
import { getChartColors, getChartTextColors, getChartStrokeColors } from "@/constants/chart-colors";

const CHIP_TO_CHART_COLOR: Record<ChipColor, ChartColor> = {
  default: ChartColor.default1,
  secondary: ChartColor.secondary1,
  destructive: ChartColor.danger1,
  success: ChartColor.success1,
  warning: ChartColor.warning1,
  info: ChartColor.primary1,
};
import { useRootStore } from "@/core/stores/root-store.provider";
import { AppCard } from "@/components/card/app-card";
import { AppCardHeader } from "@/components/card/app-card-header";
import { AppCardBody } from "@/components/card/app-card-body";

const VerticalBarChart = dynamic(
  () => import("./vertical-bar-chart").then((mod) => ({ default: mod.VerticalBarChart })),
  { ssr: false },
);
const HorizontalBarChart = dynamic(
  () => import("./horizontal-bar-chart").then((mod) => ({ default: mod.HorizontalBarChart })),
  { ssr: false },
);
const VerticalBarChartWithLabels = dynamic(
  () => import("./vertical-bar-chart-with-labels").then((mod) => ({ default: mod.VerticalBarChartWithLabels })),
  { ssr: false },
);
const HorizontalBarChartWithLabels = dynamic(
  () => import("./horizontal-bar-chart-with-labels").then((mod) => ({ default: mod.HorizontalBarChartWithLabels })),
  { ssr: false },
);
const DoughnutChart = dynamic(() => import("./doughnut-chart").then((mod) => ({ default: mod.DoughnutChart })), {
  ssr: false,
});
const RadarChartComponent = dynamic(
  () => import("./radar-chart").then((mod) => ({ default: mod.RadarChartComponent })),
  { ssr: false },
);

type Props = {
  widget: ExtendedWidget;
};

export const WidgetCard = observer(({ widget }: Props) => {
  const t = useTranslations("");
  const { resolvedTheme } = useTheme();
  const { intlStore } = useRootStore();

  const subheader = useMemo(() => {
    const data = widget.data ?? [];
    if (data.length === 0) return null;
    const total = data.reduce((sum, item) => sum + (Number(item.value) || 0), 0);

    const isCurrency = widget.aggregationType === AggregationType.dealValue;
    const formatted = isCurrency
      ? intlStore.formatCurrency(total, undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })
      : intlStore.formatNumber(total);

    if (data.length > 1) return `${formatted} · ${data.length} ${t("Diagrams.groups")}`;

    return formatted;
  }, [widget.data, widget.aggregationType, intlStore, t]);

  const cardContent = useMemo((): React.ReactElement => {
    if (!widget.data || widget.data.length === 0) {
      return (
        <div className="flex size-full flex-col space-y-3 items-center justify-center text-center">
          {t("Diagrams.noData")}
        </div>
      );
    }

    const barColors = widget.displayOptions?.barColors || [ChartColor.primary1];
    const useGroupColors = widget.displayOptions?.useGroupColors !== false;
    const chartColors = getChartColors(resolvedTheme);
    const chartTextColors = getChartTextColors(resolvedTheme);
    const chartStrokeColors = getChartStrokeColors(resolvedTheme);
    const gridColor = "var(--border)";
    const textColor = "var(--muted-foreground)";

    const chartData: ChartDataPoint[] = widget.data.map((item, index) => {
      const fallbackKey = barColors[index % barColors.length] || ChartColor.primary1;
      const colorKey: ChartColor =
        useGroupColors && item.optionColor ? CHIP_TO_CHART_COLOR[item.optionColor] : fallbackKey;
      const color = chartColors[colorKey];
      const labelColor = chartTextColors[colorKey];
      const strokeColor = chartStrokeColors[colorKey];

      return {
        label: item.label === "no-group" ? t("Diagrams.noGroup") : item.label,
        value: Number(item.value) || 0,
        fill: color,
        color,
        labelColor,
        strokeColor,
      };
    });

    const colors = useGroupColors
      ? chartData.map((point) => point.color)
      : barColors.map((color) => chartColors[color]);

    const displayType = widget.displayOptions?.displayType || DisplayType.verticalBarChart;
    const commonProps = {
      aggregationType: widget.aggregationType,
      chartData,
      colors,
      gridColor,
      textColor,
      reverseXAxis: widget.displayOptions?.reverseXAxis,
      reverseYAxis: widget.displayOptions?.reverseYAxis,
    };

    const labelChartProps = {
      aggregationType: widget.aggregationType,
      chartData,
      colors,
      textColor,
      reverseXAxis: widget.displayOptions?.reverseXAxis,
      reverseYAxis: widget.displayOptions?.reverseYAxis,
    };

    switch (displayType) {
      case DisplayType.horizontalBarChart:
        return <HorizontalBarChart {...commonProps} />;
      case DisplayType.verticalBarChartWithLabels:
        return <VerticalBarChartWithLabels {...labelChartProps} />;
      case DisplayType.horizontalBarChartWithLabels:
        return <HorizontalBarChartWithLabels {...labelChartProps} />;
      case DisplayType.doughnutChart:
        return <DoughnutChart {...commonProps} />;
      case DisplayType.radarChart:
        return <RadarChartComponent {...commonProps} />;
      default:
        return <VerticalBarChart {...commonProps} />;
    }
  }, [widget.displayOptions, widget.data, widget.aggregationType, resolvedTheme, t]);

  return (
    <AppCard className="h-full cursor-pointer overflow-visible">
      <AppCardHeader className="flex-col items-start gap-0.5">
        <h2 className="text-x-md truncate w-full">{widget.name}</h2>

        {subheader && <p className="text-xs text-muted-foreground truncate w-full">{subheader}</p>}
      </AppCardHeader>

      <AppCardBody className="overflow-visible recharts-no-focus-outline">{cardContent}</AppCardBody>
    </AppCard>
  );
});
