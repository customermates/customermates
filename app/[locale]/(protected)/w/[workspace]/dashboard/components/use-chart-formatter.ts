"use client";

import { useRecordValueFormat } from "@/components/records/record-value";

import { formatWidgetAmount, formatWidgetAxisValue } from "./widget-number-format";

export function useChartFormatter(currency?: string | null) {
  const valueFormat = useRecordValueFormat();
  return (value: number | string, compact = false) => {
    if (currency === undefined) return valueFormat.number(Number(value));
    if (compact) return formatWidgetAxisValue(value, currency, valueFormat.decimal);
    return formatWidgetAmount(value, { currency }, valueFormat.decimal);
  };
}
