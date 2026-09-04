"use client";

import type { FilterOperatorKey } from "@/core/base/base-query-builder";

import { CheckIcon } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { FilterOperatorKey as OperatorKey } from "@/core/base/base-query-builder";

type Props = {
  declaredOperators: FilterOperatorKey[];
  operator: FilterOperatorKey | undefined;
  value: unknown;
  onCommitPreset: (days: number) => void;
  onPushInput: (operator: FilterOperatorKey) => void;
};

type InputRowKey = "dateIncludes" | "dateBefore" | "dateOnOrBefore" | "dateAfter" | "dateOnOrAfter" | "dateBetween";

const DAY_PRESETS = [7, 30, 90, 365];

const INPUT_ROWS: { operator: FilterOperatorKey; key: InputRowKey }[] = [
  { operator: OperatorKey.contains, key: "dateIncludes" },
  { operator: OperatorKey.lt, key: "dateBefore" },
  { operator: OperatorKey.lte, key: "dateOnOrBefore" },
  { operator: OperatorKey.gt, key: "dateAfter" },
  { operator: OperatorKey.gte, key: "dateOnOrAfter" },
  { operator: OperatorKey.between, key: "dateBetween" },
];

export const PaletteValueDate = observer(function PaletteValueDate({
  declaredOperators,
  operator,
  value,
  onCommitPreset,
  onPushInput,
}: Props) {
  const t = useTranslations();
  const labels: Record<InputRowKey, string> = {
    dateAfter: t("Common.filters.palette.dateAfter"),
    dateBefore: t("Common.filters.palette.dateBefore"),
    dateBetween: t("Common.filters.palette.dateBetween"),
    dateIncludes: t("Common.filters.palette.dateIncludes"),
    dateOnOrAfter: t("Common.filters.palette.dateOnOrAfter"),
    dateOnOrBefore: t("Common.filters.palette.dateOnOrBefore"),
  };
  const hasRelativeWindow = declaredOperators.includes(OperatorKey.inLastDays);
  const relativeWindow = operator === OperatorKey.inLastDays && typeof value === "number" ? value : undefined;
  const marker = <CheckIcon className="ml-auto size-3.5" data-palette-current="true" />;

  return (
    <CommandList className="max-h-none! overflow-visible">
      <CommandEmpty>{t("Common.inputs.emptyContent")}</CommandEmpty>

      {hasRelativeWindow && (
        <CommandGroup>
          {DAY_PRESETS.map((days) => (
            <CommandItem
              key={days}
              data-palette-value={`inLastDays-${days}`}
              value={t("Common.filters.daysPreset", { count: days })}
              onSelect={() => onCommitPreset(days)}
            >
              <span className="truncate">{t("Common.filters.daysPreset", { count: days })}</span>

              {relativeWindow === days && marker}
            </CommandItem>
          ))}

          <CommandItem
            data-palette-value="inLastDays-custom"
            value={t("Common.filters.palette.dateCustom")}
            onSelect={() => onPushInput(OperatorKey.inLastDays)}
          >
            <span className="truncate">{t("Common.filters.palette.dateCustom")}</span>

            {relativeWindow !== undefined && !DAY_PRESETS.includes(relativeWindow) && marker}
          </CommandItem>
        </CommandGroup>
      )}

      <CommandGroup>
        {INPUT_ROWS.filter((row) => declaredOperators.includes(row.operator)).map((row) => (
          <CommandItem
            key={row.operator}
            data-palette-value={row.operator}
            value={labels[row.key]}
            onSelect={() => onPushInput(row.operator)}
          >
            <span className="truncate">{labels[row.key]}</span>

            {operator === row.operator && value !== undefined && marker}
          </CommandItem>
        ))}
      </CommandGroup>
    </CommandList>
  );
});
