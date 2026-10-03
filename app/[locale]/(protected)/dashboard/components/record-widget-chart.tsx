"use client";

import type { RecordWidgetDto } from "@/features/widget/record-widget.schema";
import type { CalculatedValue } from "@/features/records/record-model.schema";
import type { ChipColor } from "@/constants/chip-colors";
import { useTranslations } from "next-intl";
import { DisplayType } from "@/features/widget/widget.schema";
import { CHIP_COLORS } from "@/constants/chip-colors";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { hasRecordMeasureGroupFilter } from "@/features/records/record-measure.schema";
import { WidgetChart } from "./widget-chart";

export type RecordWidgetChartProps = Pick<
  RecordWidgetDto,
  "data" | "groupOptions" | "displayOptions" | "measure" | "status"
>;

export function RecordWidgetChart({ data, groupOptions, displayOptions, measure, status }: RecordWidgetChartProps) {
  const t = useTranslations();
  const locale = useHydratedIntlStore().formattingLocale;
  const format = (result: CalculatedValue): string => {
    if (result.state !== "value")
      return t(`RecordModel.${result.state === "error" ? "calculationError" : result.state}`);
    const value = result.value;
    if (value.kind === "select")
      return groupOptions.find((option) => option.id === value.value)?.label ?? t("RecordModel.unavailableOption");
    if (value.kind === "decimal") {
      return new Intl.NumberFormat(locale, {
        style: value.currency ? "currency" : "decimal",
        ...(value.currency ? { currency: value.currency } : {}),
        maximumFractionDigits: 20,
      }).format(value.value as unknown as number);
    }
    if (value.kind === "boolean") return t(`RecordModel.${value.value ? "yes" : "no"}`);
    if (value.kind === "date" || value.kind === "dateTime") {
      return new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        ...(value.value.length === 10 ? { timeZone: "UTC" } : {}),
      }).format(new Date(value.value));
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
  if (data.total.count === 0) return <p className="text-sm text-muted-foreground">{t("Diagrams.noData")}</p>;
  const rows = data.groups.map((group) => {
    const optionId =
      group.label.state === "value" && group.label.value.kind === "select" ? group.label.value.value : null;
    const option = groupOptions.find((option) => option.id === optionId);
    return {
      label: !measure.groupBy
        ? t("Diagrams.total")
        : group.label.state === "missing"
          ? t("Diagrams.noGroup")
          : format(group.label),
      result: group.result,
      formatted: format(group.result),
      optionColor: CHIP_COLORS.includes(option?.color as ChipColor) ? (option?.color as ChipColor) : undefined,
    };
  });
  const currency =
    data.total.result.state === "value" && data.total.result.value.kind === "decimal"
      ? data.total.result.value.currency
      : null;
  const dataPoints = rows.flatMap((row) =>
    row.result.state === "value" && row.result.value.kind === "decimal"
      ? [
          {
            labelKind: "literal" as const,
            label: row.label,
            value: Number(row.result.value.value),
            formattedValue: row.formatted,
            optionColor: row.optionColor,
          },
        ]
      : [],
  );
  const signedUnsupported =
    [DisplayType.doughnutChart, DisplayType.radarChart].includes(displayOptions.displayType) &&
    dataPoints.some((point) => point.value < 0);
  const useTable = dataPoints.length !== rows.length || signedUnsupported;
  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      {displayOptions.showFilters !== false && (
        <p className="text-xs text-muted-foreground">
          {t("RecordWidgets.overall", { value: format(data.total.result) })}
        </p>
      )}

      {measure.groupBy && measure.groupBy.path.length > 0 && (
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
        <div className="min-h-0 flex-1">
          <WidgetChart currency={currency} data={dataPoints} displayOptions={displayOptions} />
        </div>
      )}

      {!useTable && (
        <dl className="sr-only">
          {rows.map((row, index) => (
            <div key={index}>
              <dt>{row.label}</dt>

              <dd>{row.formatted}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
