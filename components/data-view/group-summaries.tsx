"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import type { RecordGroupSummaryResult } from "@/features/records/record-grouping.schema";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/core/utils/cn";
import { useRecordValueFormat } from "@/app/[locale]/(protected)/records/[typeId]/components/record-value";

export const GroupSummaries = observer(function GroupSummaries({
  summaries,
  compact = false,
}: {
  summaries?: RecordGroupSummaryResult[];
  compact?: boolean;
}) {
  const t = useTranslations();
  const valueFormat = useRecordValueFormat();
  if (!summaries?.length) return null;
  return (
    <span
      className={cn(
        "ml-auto flex min-w-0 items-baseline gap-x-2 text-xs text-muted-foreground tabular-nums",
        compact ? "flex-nowrap overflow-hidden" : "flex-wrap gap-y-1",
      )}
    >
      {summaries.map((summary) => {
        const result = summary.result;
        const label = `${summary.label} · ${t(`RecordModel.reducers.${summary.aggregation}`)}`;
        const decimal = result.state === "value" && result.value.kind === "decimal" ? result.value : undefined;
        const format = (notation: "standard" | "compact") =>
          decimal
            ? valueFormat.decimal(decimal.value, {
                currency: decimal.currency,
                compact: notation === "compact",
                maximumFractionDigits:
                  notation === "compact" ? 1 : (summary.decimalPlaces ?? (decimal.currency ? 2 : 10)),
              })
            : undefined;
        const full = format("standard");
        const content =
          (compact ? format("compact") : full) ??
          (result.state === "missing"
            ? "—"
            : result.state === "restricted"
              ? t("RecordModel.restricted")
              : t("RecordModel.calculationError"));
        return (
          <Tooltip key={`${summary.fieldId}:${summary.aggregation}`}>
            <TooltipTrigger asChild>
              <span
                aria-label={`${label}: ${full ?? content}`}
                className={cn("min-w-0 truncate", result.state === "error" && "text-destructive")}
              >
                {content}
              </span>
            </TooltipTrigger>

            <TooltipContent>{compact && full !== undefined ? `${label}: ${full}` : label}</TooltipContent>
          </Tooltip>
        );
      })}
    </span>
  );
});
