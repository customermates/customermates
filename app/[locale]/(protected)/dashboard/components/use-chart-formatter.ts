"use client";

import type { AggregationType } from "@/generated/prisma";
import { isCurrencyAggregation } from "@/features/widget/widget-aggregation";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";

export function useChartFormatter(aggregationType?: AggregationType, currency?: string | null) {
  const intl = useHydratedIntlStore();
  return (value: number | string, compact = false) => {
    if (currency === undefined) {
      return isCurrencyAggregation(aggregationType)
        ? intl.formatCurrency(Number(value))
        : intl.formatNumber(Number(value));
    }
    return new Intl.NumberFormat(intl.formattingLocale, {
      style: currency ? "currency" : "decimal",
      ...(currency ? { currency } : {}),
      notation: compact ? "compact" : "standard",
      maximumFractionDigits: compact ? 2 : 20,
    }).format(value as unknown as number);
  };
}
