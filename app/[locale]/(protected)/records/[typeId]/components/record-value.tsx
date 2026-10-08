"use client";

import { useTranslations } from "next-intl";
import { observer } from "mobx-react-lite";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";

import type { CalculatedValue, RecordFieldView } from "@/features/records/record-model.schema";

import { AppChip } from "@/components/chip/app-chip";
import { AppChipStack } from "@/components/chip/app-chip-stack";
import { toChipColor } from "@/constants/chip-colors";

export function EmptyValue() {
  return <span className="text-muted-foreground">—</span>;
}

type DecimalFormat = { currency?: string | null; compact?: boolean; maximumFractionDigits?: number };

export function useRecordValueFormat() {
  const intl = useHydratedIntlStore();
  const locale = intl.formattingLocale;
  return {
    decimal: (value: string | number, { currency = null, compact = false, maximumFractionDigits }: DecimalFormat = {}) =>
      new Intl.NumberFormat(locale, {
        style: currency ? "currency" : "decimal",
        ...(currency ? { currency } : {}),
        notation: compact ? "compact" : "standard",
        maximumFractionDigits: maximumFractionDigits ?? (compact ? 2 : 20),
      }).format(value as unknown as number),
    number: (value: number) => intl.formatNumber(value),
    percent: (ratio: number) =>
      new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 }).format(ratio),
    date: (value: Date, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale, options).format(value),
  };
}

export const RecordValue = observer(function RecordValue({
  result,
  field,
  wrap = false,
}: {
  result?: CalculatedValue;
  field: RecordFieldView;
  wrap?: boolean;
}) {
  const intl = useHydratedIntlStore();
  const valueFormat = useRecordValueFormat();
  const t = useTranslations();
  if (!result || result.state === "missing") return <EmptyValue />;
  if (result.state === "restricted")
    return <span className="text-muted-foreground">{t("RecordModel.restricted")}</span>;
  if (result.state === "error") return <span className="text-destructive">{t("RecordModel.calculationError")}</span>;
  const value = result.value;
  if (value.kind === "select") {
    const option = field.options.find((option) => option.id === value.value);
    return (
      <AppChip variant={toChipColor(option?.color)}>{option?.label ?? t("RecordModel.unavailableOption")}</AppChip>
    );
  }
  if (value.kind === "selectList") {
    return (
      <AppChipStack
        items={value.value.map((id) => {
          const option = field.options.find((option) => option.id === id);
          return {
            id,
            label: option?.label ?? t("RecordModel.unavailableOption"),
            variant: toChipColor(option?.color),
          };
        })}
      />
    );
  }
  if (value.kind === "boolean") return <span>{value.value ? t("RecordModel.yes") : t("RecordModel.no")}</span>;
  if (value.kind === "textList") return <span>{value.value.join(", ")}</span>;
  if (value.kind === "decimal") {
    return (
      <span className="font-mono tabular-nums">
        {valueFormat.decimal(value.value, {
          currency: value.currency,
          maximumFractionDigits: field.format?.decimalPlaces ?? (value.currency ? 2 : 10),
        })}
      </span>
    );
  }
  if (value.kind === "date" || value.kind === "dateTime") {
    return (
      <time dateTime={value.value}>
        {value.kind === "date"
          ? intl.formatDescriptiveShortDate(new Date(value.value), { timeZone: "UTC" })
          : intl.formatDescriptiveShortDateTime(new Date(value.value))}
      </time>
    );
  }
  if (value.kind === "range") {
    return (
      <span>
        {[value.start, value.end]
          .filter(Boolean)
          .map((value) =>
            field.valueType === "dateRange"
              ? intl.formatDescriptiveShortDate(new Date(value ?? ""), { timeZone: "UTC" })
              : intl.formatDescriptiveShortDateTime(new Date(value ?? "")),
          )
          .join(" – ")}
      </span>
    );
  }
  if (value.kind === "richText") return null;
  if (value.kind === "member") return <span>{t("RecordModel.member")}</span>;
  return <span className={wrap ? "whitespace-pre-wrap break-words" : "truncate"}>{value.value}</span>;
});
