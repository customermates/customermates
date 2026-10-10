"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import type { RecordGroupSummaryResult } from "@/features/records/record-grouping.schema";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/core/utils/cn";
import { useRecordValueFormat } from "@/app/[locale]/(protected)/records/[typeId]/components/record-value";

function useSummaryText() {
  const t = useTranslations();
  const valueFormat = useRecordValueFormat();
  return (summary: RecordGroupSummaryResult, compact: boolean) => {
    const result = summary.result;
    const label = `${summary.label} · ${t(`RecordModel.reducers.${summary.aggregation}`)}`;
    const decimal = result.state === "value" && result.value.kind === "decimal" ? result.value : undefined;
    const format = (notation: "standard" | "compact") =>
      decimal
        ? valueFormat.decimal(decimal.value, {
            currency: decimal.currency,
            compact: notation === "compact",
            maximumFractionDigits: notation === "compact" ? 1 : (summary.decimalPlaces ?? (decimal.currency ? 2 : 10)),
          })
        : undefined;
    const full = format("standard");
    const content =
      (compact ? format("compact") : full) ??
      (result.state === "missing"
        ? ""
        : result.state === "restricted"
          ? t("RecordModel.restricted")
          : t("RecordModel.calculationError"));
    return { label, full, content, spoken: full ?? (content || t("RecordModel.missing")) };
  };
}

export const GroupSummaries = observer(function GroupSummaries({
  summaries,
  compact = false,
  lead = false,
  details = [],
}: {
  summaries?: RecordGroupSummaryResult[];
  compact?: boolean;
  lead?: boolean;
  details?: string[];
}) {
  const summaryText = useSummaryText();
  if (!summaries?.length) return null;
  if (lead) {
    const first = summaryText(summaries[0], true);
    const lines = [
      ...summaries.map((summary) => {
        const text = summaryText(summary, false);
        return `${text.label}: ${text.spoken}`;
      }),
      ...details,
    ];
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            aria-label={lines.join(", ")}
            className={cn(
              "ml-auto min-w-0 truncate text-xs text-muted-foreground tabular-nums",
              summaries[0].result.state === "error" && "text-destructive",
            )}
            data-group-total=""
          >
            {first.content}
          </span>
        </TooltipTrigger>

        <TooltipContent className="flex flex-col gap-0.5">
          {lines.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </TooltipContent>
      </Tooltip>
    );
  }
  return (
    <span
      className={cn(
        "ml-auto flex min-w-0 items-baseline gap-x-2 text-xs text-muted-foreground tabular-nums",
        compact ? "flex-nowrap overflow-hidden" : "flex-wrap gap-y-1",
      )}
    >
      {summaries.map((summary) => {
        const { label, full, content, spoken } = summaryText(summary, compact);
        return (
          <Tooltip key={`${summary.fieldId}:${summary.aggregation}`}>
            <TooltipTrigger asChild>
              <span
                aria-label={`${label}: ${spoken}`}
                className={cn("min-w-0 truncate", summary.result.state === "error" && "text-destructive")}
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
