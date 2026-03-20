"use client";

import { observer } from "mobx-react-lite";
import { cn } from "@heroui/theme";

import { XIsoDateRangePicker } from "@/components/x-inputs/x-iso-date-range-picker";

type Props = {
  id: string;
  isValidFilter: boolean;
  granularity?: "day" | "minute";
};

export const XFilterInputIsoDateRange = observer(({ id, isValidFilter, granularity = "day" }: Props) => {
  return (
    <XIsoDateRangePicker
      showMonthAndYearPickers
      classNames={{
        base: "h-full pb-0!",
        inputWrapper: cn(
          "rounded-l-none h-full overflow-x-auto overflow-y-hidden",
          isValidFilter ? "border-primary bg-primary-50/40" : "border-default",
        ),
      }}
      granularity={granularity}
      id={id}
      label={null}
    />
  );
});
