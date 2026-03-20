"use client";

import type { DateRangePickerProps } from "@heroui/date-picker";

import { DateRangePicker } from "@heroui/date-picker";
import { useTranslations } from "next-intl";
import { observer } from "mobx-react-lite";
import { parseDateTime } from "@internationalized/date";

import { useXForm } from "./x-form";

type Props = DateRangePickerProps & {
  id: string;
};

export const XIsoDateRangePicker = observer(({ id, label, ...props }: Props) => {
  const t = useTranslations("Common.inputs");

  const store = useXForm();
  const errorMessage = store?.getError(id);
  const value = store?.getValue(id) as string[] | undefined;

  const startValue = value?.[0];
  const endValue = value?.[1];

  let parsedRangeValue: {
    start: ReturnType<typeof parseDateTime>;
    end: ReturnType<typeof parseDateTime>;
  } | null = null;

  if (startValue && endValue) {
    try {
      const normalizedStart = startValue.endsWith("Z") ? startValue.slice(0, -1) : startValue;
      const normalizedEnd = endValue.endsWith("Z") ? endValue.slice(0, -1) : endValue;
      const parsedStart = parseDateTime(normalizedStart);
      const parsedEnd = parseDateTime(normalizedEnd);
      parsedRangeValue = { start: parsedStart, end: parsedEnd };
    } catch {
      parsedRangeValue = null;
    }
  }

  function handleChange(rangeValue: Parameters<NonNullable<DateRangePickerProps["onChange"]>>[0]) {
    if (!rangeValue || !rangeValue.start || !rangeValue.end) {
      store?.onChange(id, undefined);
      return;
    }

    const startStr = rangeValue.start.toString();
    const endStr = rangeValue.end.toString();
    const startIso = startStr.includes("T") ? startStr : `${startStr}T00:00:00`;
    const endIso = endStr.includes("T") ? endStr : `${endStr}T00:00:00`;

    function normalizeDate(dateStr: string) {
      return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(dateStr) ? `${dateStr}Z` : dateStr;
    }

    store?.onChange(id, [normalizeDate(startIso), normalizeDate(endIso)]);
  }

  const defaultProps: DateRangePickerProps & { id: string } = {
    id,
    errorMessage: (
      <ul>
        {[errorMessage].flat().map((err, i) => (
          <li key={i}>{err}</li>
        ))}
      </ul>
    ),
    isDisabled: store?.isDisabled,
    isInvalid: Boolean(errorMessage),
    label: label === null ? undefined : (label ?? t(id)),
    value: parsedRangeValue,
    onChange: handleChange,
    variant: "bordered",
    ...props,
  };

  return <DateRangePicker {...defaultProps} />;
});
