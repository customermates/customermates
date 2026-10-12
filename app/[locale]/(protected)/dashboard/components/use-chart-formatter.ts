"use client";

import { useRecordValueFormat } from "@/components/records/record-value";

export function useChartFormatter(currency?: string | null) {
  const valueFormat = useRecordValueFormat();
  return (value: number | string, compact = false) =>
    currency === undefined ? valueFormat.number(Number(value)) : valueFormat.decimal(value, { currency, compact });
}
