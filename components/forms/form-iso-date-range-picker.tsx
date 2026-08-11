"use client";

import type { DateDisplayFormat } from "@/constants/date-format";
import type { DateRange } from "react-day-picker";

import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { CalendarIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { startOfMonth } from "date-fns";

import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { FormLabel } from "./form-label";
import { InputClearButton } from "./input-clear-button";
import { RANGE_PRESET_KEYS, localTimeValue, rangeForPreset, toLocalIso } from "./iso-date-values";
import type { RangePresetKey } from "./iso-date-values";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { TimeInput } from "./time-input";
import { cn } from "@/core/utils/cn";
import { useIsWiderThan } from "@/hooks/use-media-query";
import { useRootStore } from "@/core/stores/root-store.provider";

import { useAppForm } from "./form-context";
import { useFormFieldErrors } from "./use-form-field";

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

export const FormIsoDateRangePicker = observer(
  ({
    id,
    label,
    placeholder,
    required,
    displayFormat = "descriptiveLong",
    dateOnly = true,
    className,
    containerClassName,
  }: Props) => {
    const t = useTranslations();
    const resolvedPlaceholder = placeholder ?? t("Common.inputs.dateRangePlaceholder");
    const store = useAppForm();
    const { intlStore } = useRootStore();

    const raw = store?.getValue(id);
    const csvValue = typeof raw === "string" ? raw : undefined;
    const parsedRange = parseRange(csvValue);
    const { hasError } = useFormFieldErrors(id);

    const resolvedLabel = label ?? undefined;

    const formatter = dateOnly ? intlStore.dateFormatMap[displayFormat] : intlStore.dateTimeFormatMap[displayFormat];

    const [currentMonth, setCurrentMonth] = useState<Date>(() => startOfMonth(parsedRange?.from ?? new Date()));
    const isWide = useIsWiderThan("sm");

    useEffect(() => {
      if (parsedRange?.from) setCurrentMonth(startOfMonth(parsedRange.from));
    }, [parsedRange?.from?.getTime()]);

    function commit(range: DateRange | undefined) {
      if (!range || !range.from || !range.to) {
        store?.onChange(id, undefined);
        return;
      }
      store?.onChange(id, `${toLocalIso(range.from, dateOnly)},${toLocalIso(range.to, dateOnly)}`);
      setCurrentMonth(startOfMonth(range.from));
    }

    function handleSelect(next: DateRange | undefined) {
      if (!next || !next.from || !next.to) {
        if (next?.from && !next?.to) return;
        commit(undefined);
        return;
      }

      if (!dateOnly && parsedRange) {
        const fromBase = parsedRange.from;
        const toBase = parsedRange.to;
        next.from.setHours(fromBase.getHours(), fromBase.getMinutes(), fromBase.getSeconds(), 0);
        next.to.setHours(toBase.getHours(), toBase.getMinutes(), toBase.getSeconds(), 0);
      }

      commit(next);
    }

    function handleTimeChange(side: "from" | "to", value: string) {
      if (!parsedRange) return;
      const segments = value.split(":").map((p) => Number(p));
      const [hours, minutes, seconds = 0] = segments;
      if (![hours, minutes, seconds].every((n) => Number.isFinite(n))) return;
      const next = {
        from: new Date(parsedRange.from),
        to: new Date(parsedRange.to),
      };
      next[side].setHours(hours, minutes, seconds, 0);
      commit(next);
    }

    function handlePreset(key: RangePresetKey) {
      const range = rangeForPreset(key);
      const next = { from: range.from, to: range.to };
      if (!dateOnly && parsedRange) {
        next.from.setHours(
          parsedRange.from.getHours(),
          parsedRange.from.getMinutes(),
          parsedRange.from.getSeconds(),
          0,
        );
        next.to.setHours(parsedRange.to.getHours(), parsedRange.to.getMinutes(), parsedRange.to.getSeconds(), 0);
      }
      commit(next);
    }

    const fromTimeValue = parsedRange ? localTimeValue(parsedRange.from) : "";
    const toTimeValue = parsedRange ? localTimeValue(parsedRange.to) : "";

    const triggerLabel = parsedRange
      ? `${formatter(parsedRange.from)} – ${formatter(parsedRange.to)}`
      : resolvedPlaceholder;

    const calendarSelected: DateRange | undefined = parsedRange
      ? { from: parsedRange.from, to: parsedRange.to }
      : undefined;

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
                !parsedRange && "text-muted-foreground",
                className,
              )}
              disabled={store?.isDisabled}
              id={id}
              type="button"
              variant="outline"
            >
              <CalendarIcon className="mr-2 size-4 shrink-0" />

              <span className="truncate flex-1">{triggerLabel}</span>

              {parsedRange && !store?.isDisabled ? <InputClearButton onClear={() => commit(undefined)} /> : null}
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
              selected={calendarSelected}
              onMonthChange={setCurrentMonth}
              onSelect={handleSelect}
            />

            {!dateOnly && (
              <>
                <Separator />

                <div className="flex flex-col gap-3 p-3 sm:flex-row">
                  <div className="flex flex-1 flex-col gap-1.5">
                    <FormLabel className="text-xs text-muted-foreground" htmlFor={`${id}-time-from`}>
                      {t("Common.datePresets.startTime")}
                    </FormLabel>

                    <TimeInput
                      disabled={store?.isDisabled || !parsedRange}
                      id={`${id}-time-from`}
                      use12Hour={intlStore.use12Hour}
                      value={fromTimeValue}
                      onChange={(v) => handleTimeChange("from", v)}
                    />
                  </div>

                  <div className="flex flex-1 flex-col gap-1.5">
                    <FormLabel className="text-xs text-muted-foreground" htmlFor={`${id}-time-to`}>
                      {t("Common.datePresets.endTime")}
                    </FormLabel>

                    <TimeInput
                      disabled={store?.isDisabled || !parsedRange}
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
      </div>
    );
  },
);

function parseRange(value: string | undefined): { from: Date; to: Date } | undefined {
  if (!value) return undefined;
  const [fromStr, toStr] = value.split(",").map((s) => s.trim());
  if (!fromStr || !toStr) return undefined;
  const from = new Date(fromStr);
  const to = new Date(toStr);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return undefined;
  return { from, to };
}
