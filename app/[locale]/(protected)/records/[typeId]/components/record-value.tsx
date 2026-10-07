"use client";

import { useTranslations } from "next-intl";
import { observer } from "mobx-react-lite";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";

import type { CalculatedValue, RecordField, RecordMember } from "@/features/records/record-model.schema";

import { AppChip } from "@/components/chip/app-chip";
import { Avatar } from "@/components/ui/avatar";
import { toChipColor } from "@/constants/chip-colors";

export const RecordValue = observer(function RecordValue({
  result,
  field,
  members = [],
}: {
  result?: CalculatedValue;
  field: RecordField;
  members?: RecordMember[];
}) {
  const intl = useHydratedIntlStore();
  const locale = intl.formattingLocale;
  const t = useTranslations();
  if (!result || result.state === "missing") return <span className="text-muted-foreground">—</span>;
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
  if (value.kind === "boolean") return <span>{value.value ? t("RecordModel.yes") : t("RecordModel.no")}</span>;
  if (value.kind === "textList") return <span>{value.value.join(", ")}</span>;
  if (value.kind === "decimal") {
    return (
      <span className="font-mono tabular-nums">
        {new Intl.NumberFormat(locale, {
          style: value.currency ? "currency" : "decimal",
          ...(value.currency ? { currency: value.currency } : {}),
          maximumFractionDigits: field.format?.decimalPlaces ?? (value.currency ? 2 : 10),
        }).format(value.value as unknown as number)}
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
    if (!member) return <span>{t("RecordModel.member")}</span>;
    const name = `${member.firstName} ${member.lastName}`.trim();
    return (
      <span className="flex min-w-0 items-center gap-1.5">
        <Avatar aria-hidden name={[member.firstName, member.lastName]} size="sm" src={member.avatarUrl} />

        <span className="truncate">{name}</span>
      </span>
    );
  }
  return <span className="truncate">{value.value}</span>;
});
