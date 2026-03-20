"use client";

import type { DatePickerProps } from "@heroui/date-picker";

import { DatePicker } from "@heroui/date-picker";
import { useTranslations } from "next-intl";
import { observer } from "mobx-react-lite";
import { fromDate } from "@internationalized/date";

import { useXForm } from "./x-form";

type Props = DatePickerProps & { id: string };

export const XDatePicker = observer(({ id, label, ...props }: Props) => {
  const t = useTranslations("Common.inputs");

  const store = useXForm();
  const errorMessage = store?.getError(id);
  const value = store?.getValue(id) as Date | undefined;

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
    value: value ? fromDate(new Date(value), "UTC") : undefined,
    onChange: (value) => store?.onChange(id, value ? value.toDate("UTC") : undefined),
    variant: "bordered",
    ...props,
  };

  return <DatePicker {...defaultProps} />;
});
