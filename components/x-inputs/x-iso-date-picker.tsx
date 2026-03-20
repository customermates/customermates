"use client";

import type { DatePickerProps } from "@heroui/date-picker";

import { DatePicker } from "@heroui/date-picker";
import { useTranslations } from "next-intl";
import { observer } from "mobx-react-lite";
import { parseDateTime } from "@internationalized/date";

import { useXForm } from "./x-form";

type Props = DatePickerProps & {
  id: string;
};

export const XIsoDatePicker = observer(({ id, label, ...props }: Props) => {
  const t = useTranslations("Common.inputs");

  const store = useXForm();
  const errorMessage = store?.getError(id);
  const value = store?.getValue(id) as string | undefined;

  let parsedValue = null;

  if (value) {
    try {
      const normalizedValue = value.endsWith("Z") ? value.slice(0, -1) : value;
      parsedValue = parseDateTime(normalizedValue);
    } catch {
      parsedValue = undefined;
    }
  }

  function handleChange(dateValue: Parameters<NonNullable<DatePickerProps["onChange"]>>[0]) {
    if (!dateValue) {
      store?.onChange(id, undefined);
      return;
    }

    const dateStr = dateValue.toString();
    const isoDatetime =
      "hour" in dateValue || "minute" in dateValue || "second" in dateValue ? dateStr : `${dateStr}T00:00:00`;
    const normalized = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(isoDatetime) ? `${isoDatetime}Z` : isoDatetime;
    store?.onChange(id, normalized);
  }

  const defaultProps: DatePickerProps & { id: string } = {
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
    value: parsedValue,
    onChange: handleChange,
    variant: "bordered",
    ...props,
  };

  return <DatePicker {...defaultProps} />;
});
