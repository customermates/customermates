"use client";

import type { RecordWidgetDto } from "@/features/widget/record-widget.schema";
import type { CalculatedValue } from "@/features/records/record-model.schema";
import type { ChipColor } from "@/constants/chip-colors";
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { ChartColor, DisplayType } from "@/features/widget/widget.schema";
import { CHIP_COLORS } from "@/constants/chip-colors";
import { getChartColors } from "@/constants/chart-colors";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { hasRecordMeasureGroupFilter } from "@/features/records/record-measure.schema";
import { widgetDisplayTypeIssue } from "@/features/widget/widget-display-rules";
import { RankedTable } from "./ranked-table";
import { WidgetChart } from "./widget-chart";
import { WidgetNumber } from "./widget-number";
import {
  RANKED_TABLE_ROW_LIMIT,
  bucketQuarter,
  closedLostOptionIds,
  isIntegerSeries,
  isoWeek,
  fillTimeSeries,
  funnelConversions,
  orderFunnelSteps,
  rankByValue,
  shareOfTotal,
} from "./widget-series";

export type RecordWidgetChartProps = Pick<
  RecordWidgetDto,
  "data" | "groupOptions" | "displayOptions" | "measure" | "status"
> & { label?: string };

const MISSING_NUMBER = "—";

type ChartRow = {
  label: string;
  axisLabel: string;
  result: CalculatedValue;
  formatted: string;
  value: number | null;
  count: number | null;
  optionId: string | null;
  bucketStart: string | null;
  optionColor?: ChipColor;
};

export function RecordWidgetChart({
  data,
  groupOptions,
  displayOptions,
  measure,
  status,
  label,
}: RecordWidgetChartProps) {
  const t = useTranslations();
  const locale = useHydratedIntlStore().formattingLocale;
  const { resolvedTheme } = useTheme();
  const interval = measure.groupBy?.dateInterval;
  const formatDecimal = (value: string, currency: string | null) =>
    new Intl.NumberFormat(locale, {
      style: currency ? "currency" : "decimal",
      ...(currency ? { currency } : {}),
      maximumFractionDigits: 20,
    }).format(value as unknown as number);
  const bucketYears = new Set(
    (data?.groups ?? []).flatMap((group) =>
      group.label.state === "value" && group.label.value.kind === "date"
        ? [String(group.label.value.value).slice(0, 4)]
        : [],
    ),
  );
  const formatBucket = (start: string, short: boolean): string => {
    const date = new Date(`${start}T00:00:00.000Z`);
    const year = date.getUTCFullYear();
    if (interval === "quarter") return t("RecordWidgets.quarterLabel", { quarter: bucketQuarter(start), year });
    if (interval === "year") return String(year);
    if (interval === "month") {
      return new Intl.DateTimeFormat(locale, {
        month: short ? "short" : "long",
        year: "numeric",
        timeZone: "UTC",
      }).format(date);
    }
    if (interval === "week" && short) return t("RecordWidgets.weekShort", isoWeek(start));
    const formatted = new Intl.DateTimeFormat(locale, {
      ...(short
        ? { month: "short", day: "numeric", ...(bucketYears.size > 1 ? { year: "numeric" } : {}) }
        : { dateStyle: "medium" }),
      timeZone: "UTC",
    }).format(date);
    return interval === "week" ? t("RecordWidgets.weekOf", { date: formatted }) : formatted;
  };
  const format = (result: CalculatedValue): string => {
    if (result.state !== "value")
      return t(`RecordModel.${result.state === "error" ? "calculationError" : result.state}`);
    const value = result.value;
    if (value.kind === "select")
      return groupOptions.find((option) => option.id === value.value)?.label ?? t("RecordModel.unavailableOption");
    if (value.kind === "member")
      return groupOptions.find((option) => option.id === value.value)?.label ?? t("RecordWidgets.unavailableMember");
    if (value.kind === "decimal") return formatDecimal(String(value.value), value.currency ?? null);
    if (value.kind === "boolean") return t(`RecordModel.${value.value ? "yes" : "no"}`);
    if (value.kind === "date" && interval && typeof value.value === "string") return formatBucket(value.value, false);
    if (value.kind === "date" || value.kind === "dateTime") {
      return new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        ...(String(value.value).length === 10 ? { timeZone: "UTC" } : {}),
      }).format(new Date(String(value.value)));
    }
    if (["text", "email", "phone", "url"].includes(value.kind) && "value" in value) return String(value.value);
    return t("RecordModel.missing");
  };
  if (status === "unavailable" || !data) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        {t("RecordWidgets.unavailable")}
      </p>
    );
  }
  const displayType = displayOptions.displayType;
  const total = data.total.result;
  const currency = total.state === "value" && total.value.kind === "decimal" ? (total.value.currency ?? null) : null;
  if (displayType === DisplayType.number && !widgetDisplayTypeIssue(displayType, measure, null)) {
    return (
      <WidgetNumber
        caption={t("RecordWidgets.recordCount", { count: data.total.count })}
        label={label}
        value={total.state === "missing" ? MISSING_NUMBER : format(total)}
      />
    );
  }
  if (data.total.count === 0) return <p className="text-sm text-muted-foreground">{t("Diagrams.noData")}</p>;
  const rows: ChartRow[] = data.groups.map((group) => {
    const optionId =
      group.label.state === "value" && group.label.value.kind === "select" ? String(group.label.value.value) : null;
    const option = groupOptions.find((option) => option.id === optionId);
    const bucketStart =
      interval && group.label.state === "value" && group.label.value.kind === "date"
        ? String(group.label.value.value)
        : null;
    const rowLabel = !measure.groupBy
      ? t("Diagrams.total")
      : group.label.state === "missing"
        ? t("Diagrams.noGroup")
        : format(group.label);
    return {
      label: rowLabel,
      axisLabel: bucketStart ? formatBucket(bucketStart, true) : rowLabel,
      result: group.result,
      formatted: format(group.result),
      value:
        group.result.state === "value" && group.result.value.kind === "decimal"
          ? Number(group.result.value.value)
          : null,
      count: group.count,
      optionId,
      bucketStart,
      optionColor: CHIP_COLORS.includes(option?.color as ChipColor) ? (option?.color as ChipColor) : undefined,
    };
  });
  const point = (row: ChartRow, extra: { detail?: string; formattedValue?: string; missing?: boolean } = {}) => ({
    labelKind: "literal" as const,
    label: row.label,
    axisLabel: row.axisLabel,
    value: row.value ?? 0,
    formattedValue: row.formatted,
    optionColor: row.optionColor,
    ...extra,
  });
  const fillsWithZero = measure.aggregation === "count" || measure.aggregation === "sum";
  const zero = { state: "value" as const, value: { kind: "decimal" as const, value: "0", currency } };
  const notes: string[] = [];
  let content: ReactNode = null;
  let fallback = Boolean(widgetDisplayTypeIssue(displayType, measure, null)) && displayType !== DisplayType.funnelChart;

  if (!fallback && displayType === DisplayType.rankedTable) {
    const totalValue = total.state === "value" && total.value.kind === "decimal" ? Number(total.value.value) : null;
    const ranked = rankByValue(rows, locale);
    const widest = Math.max(0, ...ranked.map((row) => row.value ?? 0));
    const shares = fillsWithZero;
    content = (
      <RankedTable
        color={getChartColors(resolvedTheme)[displayOptions.barColors?.[0] ?? ChartColor.primary1]}
        hiddenCount={Math.max(0, ranked.length - RANKED_TABLE_ROW_LIMIT)}
        rows={ranked.slice(0, RANKED_TABLE_ROW_LIMIT).map((row, index) => ({
          key: `${index}:${row.label}`,
          label: row.label,
          formattedValue: row.formatted,
          share: shares ? shareOfTotal(row.value, totalValue) : null,
          barWidth: widest > 0 && row.value !== null && row.value > 0 ? row.value / widest : 0,
        }))}
      />
    );
  }

  let seriesPoints: ReturnType<typeof point>[] = [];
  if (!fallback && displayType === DisplayType.areaChart && interval) {
    const dated = rows.flatMap((row) => (row.bucketStart ? [{ start: row.bucketStart, item: row }] : []));
    const undated = data.groups.filter((group) => group.label.state === "missing");
    const unplaced = data.groups.some((group) => group.label.state === "restricted" || group.label.state === "error");
    const missingCount = undated.reduce((sum, group) => sum + (group.count ?? 0), 0);
    if (missingCount > 0) notes.push(t("RecordWidgets.withoutDate", { count: missingCount }));
    if (unplaced) notes.push(t("RecordWidgets.unplacedGroups"));
    fallback = dated.some(({ item }) => item.result.state === "restricted" || item.result.state === "error");
    seriesPoints = fillTimeSeries(dated, interval).map(({ start, item }) => {
      if (item) return point(item, { missing: item.value === null });
      const empty: ChartRow = {
        label: formatBucket(start, false),
        axisLabel: formatBucket(start, true),
        result: fillsWithZero ? zero : { state: "missing" },
        formatted: fillsWithZero ? formatDecimal("0", currency) : t("RecordWidgets.noRecordsInPeriod"),
        value: fillsWithZero ? 0 : null,
        count: 0,
        optionId: null,
        bucketStart: start,
      };
      return point(empty, { missing: !fillsWithZero });
    });
  }

  if (displayType === DisplayType.funnelChart) {
    const lost = closedLostOptionIds(groupOptions);
    const optionOrder = groupOptions.filter((option) => !lost.has(option.id)).map((option) => option.id);
    const steps = rows.flatMap((row) =>
      row.optionId && !lost.has(row.optionId) ? [{ optionId: row.optionId, item: row }] : [],
    );
    const unassigned = data.groups.filter((group) => group.label.state === "missing");
    const missingCount = unassigned.reduce((sum, group) => sum + (group.count ?? 0), 0);
    if (missingCount > 0) notes.push(t("RecordWidgets.withoutValue", { count: missingCount }));
    if (data.groups.some((group) => group.label.state === "restricted" || group.label.state === "error"))
      notes.push(t("RecordWidgets.unplacedGroups"));
    for (const option of groupOptions.filter((candidate) => lost.has(candidate.id))) {
      const row = rows.find((candidate) => candidate.optionId === option.id);
      if (row) notes.push(t("RecordWidgets.funnelClosedStage", { label: row.label, value: row.formatted }));
    }
    const ordered = orderFunnelSteps(steps, optionOrder, fillsWithZero).map(({ optionId, item }) => {
      if (item) return item;
      const option = groupOptions.find((candidate) => candidate.id === optionId);
      return {
        label: option?.label ?? t("RecordModel.unavailableOption"),
        axisLabel: option?.label ?? t("RecordModel.unavailableOption"),
        result: zero,
        formatted: formatDecimal("0", currency),
        value: 0,
        count: 0,
        optionId,
        bucketStart: null,
        optionColor: CHIP_COLORS.includes(option?.color as ChipColor) ? (option?.color as ChipColor) : undefined,
      };
    });
    fallback = steps.length === 0 || ordered.some((row) => row.value === null || row.value < 0) || fallback;
    const percent = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 });
    const conversions = funnelConversions(ordered.map((row) => row.value ?? 0));
    seriesPoints = ordered.map((row, index) => {
      const conversion = conversions[index];
      return point(row, {
        detail: conversion === null ? row.formatted : `${row.formatted} · ${percent.format(conversion)}`,
        formattedValue:
          conversion === null
            ? row.formatted
            : t("RecordWidgets.funnelTooltip", { value: row.formatted, conversion: percent.format(conversion) }),
      });
    });
  }

  const dataPoints = rows.flatMap((row) => (row.value !== null ? [point(row)] : []));
  const signedUnsupported =
    [DisplayType.doughnutChart, DisplayType.radarChart].includes(displayType) &&
    dataPoints.some((entry) => entry.value < 0);
  const useTable =
    fallback ||
    signedUnsupported ||
    (![DisplayType.rankedTable, DisplayType.areaChart, DisplayType.funnelChart].includes(displayType) &&
      dataPoints.length !== rows.length) ||
    ([DisplayType.areaChart, DisplayType.funnelChart].includes(displayType) && seriesPoints.length === 0);
  if (!useTable && !content) {
    content = (
      <div className="min-h-0 flex-1">
        <WidgetChart
          currency={currency}
          data={[DisplayType.areaChart, DisplayType.funnelChart].includes(displayType) ? seriesPoints : dataPoints}
          displayOptions={displayOptions}
          integerValues={
            measure.aggregation === "count" ||
            (currency === null &&
              measure.aggregation !== "average" &&
              isIntegerSeries(
                ([DisplayType.areaChart, DisplayType.funnelChart].includes(displayType)
                  ? seriesPoints
                  : dataPoints
                ).map((entry) => entry.value),
              ))
          }
        />
      </div>
    );
  }
  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      {displayOptions.showFilters !== false && (
        <p className="text-xs text-muted-foreground">{t("RecordWidgets.overall", { value: format(total) })}</p>
      )}

      {measure.groupBy && (measure.groupBy.path.length > 0 || measure.groupBy.fieldId === "system:assignedTo") && (
        <p className="text-xs text-muted-foreground">{t("RecordWidgets.attribution")}</p>
      )}

      {hasRecordMeasureGroupFilter(measure) && (
        <p className="text-xs text-muted-foreground">{t("RecordWidgets.groupFilterSummary")}</p>
      )}

      {useTable ? (
        <div className="min-h-0 overflow-auto">
          {signedUnsupported && <p className="mb-2 text-xs text-muted-foreground">{t("RecordWidgets.signedChart")}</p>}

          <dl className="space-y-1 text-sm">
            {rows.map((row, index) => (
              <div key={index} className="flex justify-between gap-4">
                <dt>{row.label}</dt>

                <dd className="tabular-nums">{row.formatted}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : (
        content
      )}

      {!useTable && notes.length > 0 && (
        <div className="space-y-0.5" data-slot="widget-chart-notes">
          {notes.map((note) => (
            <p key={note} className="text-xs text-muted-foreground">
              {note}
            </p>
          ))}
        </div>
      )}

      {!useTable && displayType !== DisplayType.rankedTable && (
        <dl className="sr-only">
          {([DisplayType.areaChart, DisplayType.funnelChart].includes(displayType) ? seriesPoints : rows).map(
            (row, index) => (
              <div key={index}>
                <dt>{row.label}</dt>

                <dd>{"formattedValue" in row ? row.formattedValue : row.formatted}</dd>
              </div>
            ),
          )}
        </dl>
      )}
    </div>
  );
}
