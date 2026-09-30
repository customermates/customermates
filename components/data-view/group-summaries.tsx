"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import type { RecordGroupSummaryResult } from "@/features/records/record-grouping.schema";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { cn } from "@/core/utils/cn";

export const GroupSummaries = observer(function GroupSummaries({
  summaries,
}: {
  summaries?: RecordGroupSummaryResult[];
}) {
  const t = useTranslations();
  const intl = useHydratedIntlStore();
  if (!summaries?.length) return null;
  return (
    <span className="ml-auto flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1 text-xs text-muted-foreground tabular-nums">
      {summaries.map((summary) => {
        const result = summary.result;
        const label = `${summary.label} · ${t(`RecordModel.reducers.${summary.aggregation}`)}`;
        const content =
          result.state === "value" && result.value.kind === "decimal"
            ? new Intl.NumberFormat(intl.formattingLocale, {
                style: result.value.currency ? "currency" : "decimal",
                ...(result.value.currency ? { currency: result.value.currency } : {}),
                maximumFractionDigits: summary.decimalPlaces ?? (result.value.currency ? 2 : 10),
              }).format(result.value.value as unknown as number)
            : result.state === "missing"
              ? "—"
              : result.state === "restricted"
                ? t("RecordModel.restricted")
                : t("RecordModel.calculationError");
        return (
          <Tooltip key={`${summary.fieldId}:${summary.aggregation}`}>
            <TooltipTrigger asChild>
              <span
                aria-label={`${label}: ${content}`}
                className={cn("min-w-0 truncate", result.state === "error" && "text-destructive")}
              >
                {content}
              </span>
            </TooltipTrigger>

            <TooltipContent>{label}</TooltipContent>
          </Tooltip>
        );
      })}
    </span>
  );
});
