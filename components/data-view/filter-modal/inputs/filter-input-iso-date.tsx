"use client";

import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { CalendarIcon } from "lucide-react";
import { startOfMonth } from "date-fns";
import { useTranslations } from "next-intl";

import { useAppForm } from "@/components/forms/form-context";
import { FormLabel } from "@/components/forms/form-label";
import { InputClearButton } from "@/components/forms/input-clear-button";
import { DATE_PRESETS, localTimeValue, parseIsoDate, toLocalIso } from "@/components/forms/iso-date-values";
import { TimeInput } from "@/components/forms/time-input";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { cn } from "@/core/utils/cn";

type Props = {
  id: string;
  isValidFilter: boolean;
  granularity?: "day" | "minute";
};

export const FilterInputIsoDate = observer(({ id, isValidFilter, granularity = "day" }: Props) => {
  const store = useAppForm();
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();
  const raw = store?.getValue(id);
  const isoValue = typeof raw === "string" ? raw : undefined;
  const parsed = parseIsoDate(isoValue);
  const dateOnly = granularity === "day";

  const [currentMonth, setCurrentMonth] = useState<Date>(() => startOfMonth(parsed ?? new Date()));

  useEffect(() => {
    if (parsed) setCurrentMonth(startOfMonth(parsed));
  }, [parsed?.getTime()]);

  function commit(date: Date | undefined) {
    if (!date) {
      store?.onChange(id, undefined);
      store?.flushPendingChanges?.();
      return;
    }
    store?.onChange(id, toLocalIso(date, dateOnly));
    store?.flushPendingChanges?.();
    setCurrentMonth(startOfMonth(date));
  }

  function handleSelect(next: Date | undefined) {
    if (!next) {
      commit(undefined);
      return;
    }
    if (!dateOnly && parsed) next.setHours(parsed.getHours(), parsed.getMinutes(), parsed.getSeconds(), 0);
    commit(next);
  }

  function handleTimeChange(value: string) {
    const segments = value.split(":").map((p) => Number(p));
    const [hours, minutes, seconds = 0] = segments;
    if (![hours, minutes, seconds].every((n) => Number.isFinite(n))) return;
    const base = parsed ?? new Date();
    const next = new Date(base);
    next.setHours(hours, minutes, seconds, 0);
    commit(next);
  }

  function handlePreset(compute: (today: Date) => Date) {
    const today = new Date();
    const baseToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const next = compute(baseToday);
    if (!dateOnly && parsed) next.setHours(parsed.getHours(), parsed.getMinutes(), parsed.getSeconds(), 0);
    commit(next);
  }

  const formatter = dateOnly ? intlStore.dateFormatMap.descriptiveLong : intlStore.dateTimeFormatMap.descriptiveLong;
  const timeValue = parsed ? localTimeValue(parsed) : "";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          className={cn(
            "size-full justify-start text-left font-normal",
            !parsed && "text-muted-foreground",
            isValidFilter ? "border-primary bg-primary/10" : "border-input",
          )}
          disabled={store?.isDisabled}
          id={id}
          type="button"
          variant="field"
        >
          <CalendarIcon className="mr-2 size-4 shrink-0" />

          <span className="truncate flex-1">{parsed ? formatter(parsed) : ""}</span>

          {parsed && !store?.isDisabled ? <InputClearButton onClear={() => commit(undefined)} /> : null}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        className="w-auto max-h-(--radix-popover-content-available-height) overflow-y-auto p-0"
      >
        <Calendar
          autoFocus
          disabled={store?.isDisabled}
          mode="single"
          month={currentMonth}
          selected={parsed}
          onMonthChange={setCurrentMonth}
          onSelect={handleSelect}
        />

        {!dateOnly && (
          <>
            <Separator />

            <div className="flex flex-col gap-2 p-3">
              <FormLabel className="text-xs text-muted-foreground" htmlFor={`${id}-time`}>
                {t("Common.datePresets.startTime")}
              </FormLabel>

              <TimeInput
                disabled={store?.isDisabled}
                id={`${id}-time`}
                use12Hour={intlStore.use12Hour}
                value={timeValue}
                onChange={handleTimeChange}
              />
            </div>
          </>
        )}

        <Separator />

        <div className="grid grid-cols-2 gap-2 p-3">
          {DATE_PRESETS.map((preset) => (
            <Button
              key={preset.key}
              disabled={store?.isDisabled}
              size="sm"
              type="button"
              variant="secondary"
              onClick={() => handlePreset(preset.compute)}
            >
              {t(`Common.datePresets.${preset.key}`)}
            </Button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
});
