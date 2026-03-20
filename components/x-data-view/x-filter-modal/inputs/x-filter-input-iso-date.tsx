"use client";

import { observer } from "mobx-react-lite";
import { cn } from "@heroui/theme";

import { XIsoDatePicker } from "@/components/x-inputs/x-iso-date-picker";

type Props = {
  id: string;
  isValidFilter: boolean;
  granularity?: "day" | "minute";
};

export const XFilterInputIsoDate = observer(({ id, isValidFilter, granularity = "day" }: Props) => {
  return (
    <XIsoDatePicker
      showMonthAndYearPickers
      classNames={{
        base: "h-full pb-0!",
        inputWrapper: cn("rounded-l-none h-full", isValidFilter ? "border-primary bg-primary-50/40" : "border-default"),
      }}
      granularity={granularity}
      id={id}
      label={null}
    />
  );
});
