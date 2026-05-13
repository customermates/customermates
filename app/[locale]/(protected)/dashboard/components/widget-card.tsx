"use client";

import type { ChartDataPoint } from "./chart.types";
import type { ExtendedWidget } from "@/features/widget/widget.types";
import type { ChipColor } from "@/constants/chip-colors";
import type { Filter } from "@/core/base/base-get.schema";

import React, { Fragment, useMemo } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import dynamic from "next/dynamic";

import { AggregationType, EntityType } from "@/generated/prisma";

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
import { hasValidFilterConfiguration } from "@/components/data-view/table-view.utils";
import { FilterChipValue, getFilterLabel } from "@/components/data-view/filter-modal/filter-chip-display";

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
  const tCommon = useTranslations("Common");
  const { resolvedTheme } = useTheme();
  const { intlStore, widgetModalStore, widgetsStore } = useRootStore();
  const customColumns = widgetsStore.customColumns;
  const dealCustomColumns = useMemo(
    () => customColumns.filter((c) => c.entityType === EntityType.deal),
    [customColumns],
  );
  const entityCustomColumns = useMemo(
    () => customColumns.filter((c) => c.entityType === widget.entityType),
    [customColumns, widget.entityType],
  );

  const activeEntityFilters = useMemo<Filter[]>(
    () => (widget.entityFilters ?? []).filter(hasValidFilterConfiguration),
    [widget.entityFilters],
  );
  const activeDealFilters = useMemo<Filter[]>(
    () => (widget.entityType === EntityType.deal ? [] : (widget.dealFilters ?? []).filter(hasValidFilterConfiguration)),
    [widget.dealFilters, widget.entityType],
  );

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
    const showLegend = widget.displayOptions?.showLegend !== false;
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
        return <DoughnutChart {...commonProps} showLegend={showLegend} />;
      case DisplayType.radarChart:
        return <RadarChartComponent {...commonProps} />;
      default:
        return <VerticalBarChart {...commonProps} />;
    }
  }, [widget.displayOptions, widget.data, widget.aggregationType, resolvedTheme, t]);

  const showFilters = widget.displayOptions?.showFilters !== false;

  const inlineFilters: Array<{
    key: string;
    label: string;
    operator: string;
    customColumns: typeof entityCustomColumns;
    filter: Filter;
    onClick: () => void;
  }> = showFilters
    ? [
        ...activeEntityFilters.map((filter, index) => ({
          key: `entity-${filter.field}-${index}`,
          label: getFilterLabel(filter, entityCustomColumns, tCommon),
          operator: tCommon(`filters.operators.${filter.operator}`),
          customColumns: entityCustomColumns,
          filter,
          onClick: () => widgetModalStore.openWithFilter(widget.id, "filters", filter.field),
        })),
        ...activeDealFilters.map((filter, index) => ({
          key: `deal-${filter.field}-${index}`,
          label: getFilterLabel(filter, dealCustomColumns, tCommon),
          operator: tCommon(`filters.operators.${filter.operator}`),
          customColumns: dealCustomColumns,
          filter,
          onClick: () => widgetModalStore.openWithFilter(widget.id, "dealFilters", filter.field),
        })),
      ]
    : [];

  const showSubheaderRow = subheader || inlineFilters.length > 0;

  return (
    <AppCard className="h-full cursor-pointer overflow-visible">
      <AppCardHeader className="flex-col items-start gap-0.5">
        <h2 className="text-x-md truncate w-full">{widget.name}</h2>

        {showSubheaderRow && (
          <p className="text-xs text-muted-foreground w-full line-clamp-2 wrap-break-word">
            {subheader}

            {inlineFilters.map((f) => (
              <Fragment key={f.key}>
                <span aria-hidden className="mx-1 opacity-40">
                  ·
                </span>

                <span
                  className="cursor-pointer hover:text-foreground transition-colors"
                  role="button"
                  tabIndex={0}
                  title={f.label}
                  onClick={(e) => {
                    e.stopPropagation();
                    f.onClick();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      e.stopPropagation();
                      f.onClick();
                    }
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <span className="font-medium">{f.label}</span>

                  <span className="mx-1">{f.operator}</span>

                  <FilterChipValue customColumns={f.customColumns} filter={f.filter} />
                </span>
              </Fragment>
            ))}
          </p>
        )}
      </AppCardHeader>

      <AppCardBody className="overflow-visible recharts-no-focus-outline">{cardContent}</AppCardBody>
    </AppCard>
  );
});
