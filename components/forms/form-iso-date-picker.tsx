"use client";

import type { DateDisplayFormat } from "@/constants/date-format";

import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { CalendarIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { addMonths, addWeeks, addYears, startOfMonth } from "date-fns";

import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { FormLabel } from "./form-label";
import { InputClearButton } from "./input-clear-button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { TimeInput } from "./time-input";
import { cn } from "@/lib/utils";
import { useRootStore } from "@/core/stores/root-store.provider";

import { useAppForm } from "./form-context";

type Props = {
  id: string;
  label?: string | null;
  placeholder?: string;
  required?: boolean;
  displayFormat?: DateDisplayFormat;
  dateOnly?: boolean;
  className?: string;
  containerClassName?: string;
};

const PRESETS: ReadonlyArray<{ key: string; compute: (today: Date) => Date }> = [
  { key: "today", compute: (d) => d },
  { key: "inAWeek", compute: (d) => addWeeks(d, 1) },
  { key: "inAMonth", compute: (d) => addMonths(d, 1) },
  { key: "inAYear", compute: (d) => addYears(d, 1) },
];

export const FormIsoDatePicker = observer(
  ({
    id,
    label,
    placeholder = "Pick a date",
    required,
    displayFormat = "descriptiveLong",
    dateOnly = true,
    className,
    containerClassName,
  }: Props) => {
    const t = useTranslations();
    const tInputs = useTranslations("Common.inputs");
    const store = useAppForm();
    const { intlStore } = useRootStore();

    const raw = store?.getValue(id);
    const isoValue = typeof raw === "string" ? raw : undefined;
    const parsed = parseIso(isoValue);
    const errors = store?.getError(id);
    const hasError = Array.isArray(errors) ? errors.length > 0 : Boolean(errors);

    const resolvedLabel = label === null ? undefined : (label ?? safeTranslate(tInputs, id));

    const formatter = dateOnly ? intlStore.dateFormatMap[displayFormat] : intlStore.dateTimeFormatMap[displayFormat];

    const [currentMonth, setCurrentMonth] = useState<Date>(() => startOfMonth(parsed ?? new Date()));

    useEffect(() => {
      if (parsed) setCurrentMonth(startOfMonth(parsed));
    }, [parsed?.getTime()]);

    function commit(date: Date | undefined) {
      if (!date) {
        store?.onChange(id, undefined);
        return;
      }
      store?.onChange(id, toIso(date, dateOnly));
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

    const timeValue = parsed
      ? `${String(parsed.getHours()).padStart(2, "0")}:${String(parsed.getMinutes()).padStart(2, "0")}:${String(parsed.getSeconds()).padStart(2, "0")}`
      : "";

    return (
      <div className={cn("flex flex-col gap-1.5", containerClassName)}>
        {resolvedLabel && (
          <FormLabel htmlFor={id}>
            {resolvedLabel}

            {required ? <span className="text-destructive"> *</span> : null}
          </FormLabel>
        )}

        <Popover>
          <PopoverTrigger asChild>
            <Button
              aria-invalid={hasError}
              className={cn(
                "w-full justify-start text-left font-normal",
                !parsed && "text-muted-foreground",
                className,
              )}
              disabled={store?.isDisabled}
              id={id}
              type="button"
              variant="outline"
            >
              <CalendarIcon className="mr-2 size-4 shrink-0" />

              <span className="truncate flex-1">{parsed ? formatter(parsed) : placeholder}</span>

              {parsed && !store?.isDisabled ? <InputClearButton onClear={() => commit(undefined)} /> : null}
            </Button>
          </PopoverTrigger>

          <PopoverContent
            align="start"
            className="w-auto max-h-[var(--radix-popover-content-available-height)] overflow-y-auto p-0"
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
              {PRESETS.map((preset) => (
                <Button
                  key={preset.key}
                  disabled={store?.isDisabled}
                  size="sm"
                  type="button"
                  variant="outline"
                  onClick={() => handlePreset(preset.compute)}
                >
                  {t(`Common.datePresets.${preset.key}`)}
                </Button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    );
  },
);

function parseIso(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function toIso(date: Date, dateOnly: boolean): string {
  if (dateOnly) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return date.toISOString();
}

function safeTranslate(t: (k: string) => string, key: string): string {
  try {
    return t(key);
  } catch {
    return key;
  }
}
