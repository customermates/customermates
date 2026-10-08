"use client";

import { useTranslations } from "next-intl";
import { observer } from "mobx-react-lite";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";

import type { CalculatedValue, RecordFieldView, RecordMember } from "@/features/records/record-model.schema";

import { AppChip } from "@/components/chip/app-chip";
import { MemberChip } from "@/components/chip/member-chip";
import { AppChipStack } from "@/components/chip/app-chip-stack";
import { toChipColor } from "@/constants/chip-colors";

export function formatRecordDecimal(
  locale: string,
  value: { value: string; currency?: string | null },
  options: { decimalPlaces?: number; notation?: "standard" | "compact" } = {},
) {
  const notation = options.notation ?? "standard";
  return new Intl.NumberFormat(locale, {
    style: value.currency ? "currency" : "decimal",
    ...(value.currency ? { currency: value.currency } : {}),
    notation,
    maximumFractionDigits: notation === "compact" ? 1 : (options.decimalPlaces ?? (value.currency ? 2 : 10)),
  }).format(value.value as unknown as number);
}

export function EmptyValue() {
  return <span className="text-muted-foreground">—</span>;
}

export const RecordValue = observer(function RecordValue({
  result,
  field,
  members = [],
  wrap = false,
}: {
  result?: CalculatedValue;
  field: RecordFieldView;
  members?: RecordMember[];
  wrap?: boolean;
}) {
  const intl = useHydratedIntlStore();
  const locale = intl.formattingLocale;
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
        {formatRecordDecimal(locale, value, { decimalPlaces: field.format?.decimalPlaces ?? undefined })}
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
  if (value.kind === "member") {
    const member = members.find((user) => user.id === value.value);
    return member ? <MemberChip member={member} /> : <AppChip>{t("RecordModel.member")}</AppChip>;
  }
  return <span className={wrap ? "whitespace-pre-wrap break-words" : "truncate"}>{value.value}</span>;
});
