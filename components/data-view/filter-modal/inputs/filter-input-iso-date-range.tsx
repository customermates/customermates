"use client";

import type { DateRange } from "react-day-picker";

import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { CalendarIcon } from "lucide-react";
import { startOfMonth } from "date-fns";
import { useTranslations } from "next-intl";

import { useAppForm } from "@/components/forms/form-context";
import { FormLabel } from "@/components/forms/form-label";
import { InputClearButton } from "@/components/forms/input-clear-button";
import {
  RANGE_PRESET_KEYS,
  localTimeValue,
  parseIsoDate,
  rangeForPreset,
  toLocalIso,
} from "@/components/forms/iso-date-values";
import type { RangePresetKey } from "@/components/forms/iso-date-values";
import { TimeInput } from "@/components/forms/time-input";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { useRootStore } from "@/core/stores/root-store.provider";
import { cn } from "@/core/utils/cn";
import { useIsWiderThan } from "@/hooks/use-media-query";

type Props = {
  id: string;
  isValidFilter: boolean;
  granularity?: "day" | "minute";
};

export const FilterInputIsoDateRange = observer(({ id, isValidFilter, granularity = "day" }: Props) => {
  const store = useAppForm();
  const t = useTranslations();
  const { intlStore } = useRootStore();
  const raw = store?.getValue(id);
  const tuple = Array.isArray(raw) ? (raw as Array<string | undefined>) : undefined;
  const dateOnly = granularity === "day";

  const startDate = parseIsoDate(tuple?.[0]);
  const endDate = parseIsoDate(tuple?.[1]);

  const selected: DateRange | undefined = startDate ? { from: startDate, to: endDate } : undefined;

  const [currentMonth, setCurrentMonth] = useState<Date>(() => startOfMonth(startDate ?? new Date()));
  const isWide = useIsWiderThan("sm");

  useEffect(() => {
    if (startDate) setCurrentMonth(startOfMonth(startDate));
  }, [startDate?.getTime()]);

  function commit(range: DateRange | undefined) {
    if (!range?.from || !range?.to) {
      if (!range?.from) {
        store?.onChange(id, undefined);
        store?.flushPendingChanges?.();
        return;
      }
      return;
    }
    store?.onChange(id, [toLocalIso(range.from, dateOnly), toLocalIso(range.to, dateOnly)]);
    store?.flushPendingChanges?.();
    setCurrentMonth(startOfMonth(range.from));
  }

  function handleSelect(next: DateRange | undefined) {
    if (!next?.from || !next?.to) {
      commit(next);
      return;
    }
    const merged = { from: new Date(next.from), to: new Date(next.to) };
    if (!dateOnly) {
      if (startDate) merged.from.setHours(startDate.getHours(), startDate.getMinutes(), startDate.getSeconds(), 0);
      if (endDate) merged.to.setHours(endDate.getHours(), endDate.getMinutes(), endDate.getSeconds(), 0);
    }
    commit(merged);
  }

  function handleTimeChange(side: "from" | "to", value: string) {
    if (!startDate || !endDate) return;
    const segments = value.split(":").map((p) => Number(p));
    const [hours, minutes, seconds = 0] = segments;
    if (![hours, minutes, seconds].every((n) => Number.isFinite(n))) return;
    const next = { from: new Date(startDate), to: new Date(endDate) };
    next[side].setHours(hours, minutes, seconds, 0);
    commit(next);
  }

  function handlePreset(key: RangePresetKey) {
    const range = rangeForPreset(key);
    const next = { from: range.from, to: range.to };
    if (!dateOnly) {
      if (startDate) next.from.setHours(startDate.getHours(), startDate.getMinutes(), startDate.getSeconds(), 0);
      if (endDate) next.to.setHours(endDate.getHours(), endDate.getMinutes(), endDate.getSeconds(), 0);
    }
    commit(next);
  }

  const formatter = dateOnly ? intlStore.dateFormatMap.descriptiveLong : intlStore.dateTimeFormatMap.descriptiveLong;
  const hasBoth = startDate && endDate;
  const fromTimeValue = startDate ? localTimeValue(startDate) : "";
  const toTimeValue = endDate ? localTimeValue(endDate) : "";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          className={cn(
            "size-full justify-start text-left font-normal",
            !hasBoth && "text-muted-foreground",
            isValidFilter ? "border-primary bg-primary/10" : "border-input",
          )}
          disabled={store?.isDisabled}
          id={id}
          type="button"
          variant="outline"
        >
          <CalendarIcon className="mr-2 size-4 shrink-0" />

          <span className="truncate flex-1">{hasBoth ? `${formatter(startDate)} – ${formatter(endDate)}` : ""}</span>

          {hasBoth && !store?.isDisabled ? <InputClearButton onClear={() => commit(undefined)} /> : null}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        className="w-auto max-h-(--radix-popover-content-available-height) overflow-y-auto p-0"
      >
        <Calendar
          autoFocus
          disabled={store?.isDisabled}
          mode="range"
          month={currentMonth}
          numberOfMonths={isWide ? 2 : 1}
          selected={selected}
          onMonthChange={setCurrentMonth}
          onSelect={handleSelect}
        />

        {!dateOnly && hasBoth && (
          <>
            <Separator />

            <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <FormLabel className="text-xs text-muted-foreground" htmlFor={`${id}-time-from`}>
                  {t("Common.datePresets.startTime")}
                </FormLabel>

                <TimeInput
                  disabled={store?.isDisabled}
                  id={`${id}-time-from`}
                  use12Hour={intlStore.use12Hour}
                  value={fromTimeValue}
                  onChange={(v) => handleTimeChange("from", v)}
                />
              </div>

              <div className="flex flex-col gap-2">
                <FormLabel className="text-xs text-muted-foreground" htmlFor={`${id}-time-to`}>
                  {t("Common.datePresets.endTime")}
                </FormLabel>

                <TimeInput
                  disabled={store?.isDisabled}
                  id={`${id}-time-to`}
                  use12Hour={intlStore.use12Hour}
                  value={toTimeValue}
                  onChange={(v) => handleTimeChange("to", v)}
                />
              </div>
            </div>
          </>
        )}

        <Separator />

        <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3">
          {RANGE_PRESET_KEYS.map((key) => (
            <Button
              key={key}
              disabled={store?.isDisabled}
              size="sm"
              type="button"
              variant="outline"
              onClick={() => handlePreset(key)}
            >
              {t(`Common.datePresets.${key}`)}
            </Button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
});
