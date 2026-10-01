"use client";

import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";

export function useChartFormatter(currency?: string | null) {
  const intl = useHydratedIntlStore();
  return (value: number | string, compact = false) => {
    if (currency === undefined) return intl.formatNumber(Number(value));

    return new Intl.NumberFormat(intl.formattingLocale, {
      style: currency ? "currency" : "decimal",
      ...(currency ? { currency } : {}),
      notation: compact ? "compact" : "standard",
      maximumFractionDigits: compact ? 2 : 20,
    }).format(value as unknown as number);
  };
}
