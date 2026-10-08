"use client";

import { useRecordValueFormat } from "@/app/[locale]/(protected)/records/[typeId]/components/record-value";

export function useChartFormatter(currency?: string | null) {
  const valueFormat = useRecordValueFormat();
  return (value: number | string, compact = false) =>
    currency === undefined ? valueFormat.number(Number(value)) : valueFormat.decimal(value, { currency, compact });
}
