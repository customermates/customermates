"use client";

import type { DateRange } from "react-day-picker";

import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { CalendarIcon } from "lucide-react";
import { format, addDays, addMonths, addWeeks, endOfMonth, startOfMonth } from "date-fns";
import { useTranslations } from "next-intl";

import { useAppForm } from "@/components/forms/form-context";
import { FormLabel } from "@/components/forms/form-label";
import { InputClearButton } from "@/components/forms/input-clear-button";
import { TimeInput } from "@/components/forms/time-input";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { useRootStore } from "@/core/stores/root-store.provider";
import { cn } from "@/lib/utils";

type Props = {
  id: string;
  isValidFilter: boolean;
  granularity?: "day" | "minute";
};

type PresetKey = "today" | "inAWeek" | "thisMonth" | "nextMonth" | "next7Days" | "next30Days";

const PRESET_KEYS: ReadonlyArray<PresetKey> = ["today", "inAWeek", "thisMonth", "nextMonth", "next7Days", "next30Days"];

function rangeForPreset(key: PresetKey): { from: Date; to: Date } {
  const today = new Date();
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const baseToday = start(today);
  switch (key) {
    case "today":
      return { from: baseToday, to: baseToday };
    case "inAWeek": {
      const d = addWeeks(baseToday, 1);
      return { from: d, to: d };
    }
    case "thisMonth":
      return { from: startOfMonth(today), to: endOfMonth(today) };
    case "nextMonth": {
      const next = addMonths(today, 1);
      return { from: startOfMonth(next), to: endOfMonth(next) };
    }
    case "next7Days":
      return { from: baseToday, to: addDays(baseToday, 6) };
    case "next30Days":
      return { from: baseToday, to: addDays(baseToday, 29) };
  }
}

export const FilterInputIsoDateRange = observer(({ id, isValidFilter, granularity = "day" }: Props) => {
  const store = useAppForm();
  const t = useTranslations();
  const { intlStore } = useRootStore();
  const raw = store?.getValue(id);
  const tuple = Array.isArray(raw) ? (raw as Array<string | undefined>) : undefined;
  const dateOnly = granularity === "day";

  const startDate = parseIso(tuple?.[0]);
  const endDate = parseIso(tuple?.[1]);

  const selected: DateRange | undefined = startDate ? { from: startDate, to: endDate } : undefined;

  const [currentMonth, setCurrentMonth] = useState<Date>(() => startOfMonth(startDate ?? new Date()));
  const [isWide, setIsWide] = useState<boolean>(() =>
    typeof window === "undefined" ? true : window.matchMedia("(min-width: 640px)").matches,
  );

  useEffect(() => {
    if (startDate) setCurrentMonth(startOfMonth(startDate));
  }, [startDate?.getTime()]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 640px)");
    const handle = () => setIsWide(mq.matches);
    handle();
    mq.addEventListener("change", handle);
    window.addEventListener("resize", handle);
    return () => {
      mq.removeEventListener("change", handle);
      window.removeEventListener("resize", handle);
    };
  }, []);

  function commit(range: DateRange | undefined) {
    if (!range?.from || !range?.to) {
      if (!range?.from) {
        store?.onChange(id, undefined);
        return;
      }
      return;
    }
    store?.onChange(id, [toIso(range.from, granularity), toIso(range.to, granularity)]);
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

  function handlePreset(key: PresetKey) {
    const range = rangeForPreset(key);
    const next = { from: range.from, to: range.to };
    if (!dateOnly) {
      if (startDate) next.from.setHours(startDate.getHours(), startDate.getMinutes(), startDate.getSeconds(), 0);
      if (endDate) next.to.setHours(endDate.getHours(), endDate.getMinutes(), endDate.getSeconds(), 0);
    }
    commit(next);
  }

  const dateFormat = dateOnly ? "PPP" : "PPp";
  const hasBoth = startDate && endDate;
  const fromTimeValue = startDate
    ? `${String(startDate.getHours()).padStart(2, "0")}:${String(startDate.getMinutes()).padStart(2, "0")}:${String(startDate.getSeconds()).padStart(2, "0")}`
    : "";
  const toTimeValue = endDate
    ? `${String(endDate.getHours()).padStart(2, "0")}:${String(endDate.getMinutes()).padStart(2, "0")}:${String(endDate.getSeconds()).padStart(2, "0")}`
    : "";

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

          <span className="truncate flex-1">
            {hasBoth ? `${format(startDate, dateFormat)} – ${format(endDate, dateFormat)}` : ""}
          </span>

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
          {PRESET_KEYS.map((key) => (
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

function parseIso(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function toIso(date: Date, granularity: "day" | "minute"): string {
  if (granularity === "day") {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return date.toISOString();
}
