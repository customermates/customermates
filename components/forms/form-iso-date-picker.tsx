"use client";

import type { DateDisplayFormat } from "@/constants/date-format";

import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { CalendarIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { startOfMonth } from "date-fns";

import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { FormLabel } from "./form-label";
import { InputClearButton } from "./input-clear-button";
import { DATE_PRESETS, localTimeValue, parseIsoDate, toLocalIso } from "./iso-date-values";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { TimeInput } from "./time-input";
import { cn } from "@/core/utils/cn";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";

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

export const FormIsoDatePicker = observer(
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
    const resolvedPlaceholder = placeholder ?? t("Common.inputs.datePlaceholder");
    const store = useAppForm();
    const intlStore = useHydratedIntlStore();

    const raw = store?.getValue(id);
    const isoValue = typeof raw === "string" ? raw : undefined;
    const parsed = parseIsoDate(isoValue);
    const { hasError } = useFormFieldErrors(id);
    const isLoading = store?.isLoading ?? false;
    const isReadOnly = !isLoading && (store?.isReadOnly ?? false);

    const resolvedLabel = label ?? undefined;

    const formatter = dateOnly ? intlStore.dateFormatMap[displayFormat] : intlStore.dateTimeFormatMap[displayFormat];

    const [currentMonth, setCurrentMonth] = useState<Date>(() => startOfMonth(parsed ?? new Date()));

    useEffect(() => {
      if (parsed) setCurrentMonth(startOfMonth(parsed));
    }, [parsed?.getTime()]);

    function commit(date: Date | undefined) {
      if (isReadOnly || isLoading) return;

      if (!date) {
        store?.onChange(id, undefined);
        return;
      }
      store?.onChange(id, toLocalIso(date, dateOnly));
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

    const timeValue = parsed ? localTimeValue(parsed) : "";

    return (
      <div className={cn("flex flex-col gap-1.5", containerClassName)}>
        {resolvedLabel && (
          <FormLabel htmlFor={id}>
            {resolvedLabel}

            {required ? <span className="text-destructive"> *</span> : null}
          </FormLabel>
        )}

        <Popover open={isReadOnly || isLoading ? false : undefined}>
          <PopoverTrigger asChild>
            <Button
              aria-disabled={isReadOnly || undefined}
              aria-invalid={hasError}
              className={cn(
                "w-full justify-start text-left font-normal",
                !parsed && "text-muted-foreground",
                className,
              )}
              data-field-state={isReadOnly ? "read-only" : undefined}
              disabled={isLoading}
              id={id}
              type="button"
              variant="field"
            >
              <CalendarIcon className="mr-2 size-4 shrink-0" />

              <span className="truncate flex-1">{parsed ? formatter(parsed) : resolvedPlaceholder}</span>

              {parsed && !isReadOnly && !isLoading ? <InputClearButton onClear={() => commit(undefined)} /> : null}
            </Button>
          </PopoverTrigger>

          <PopoverContent
            align="start"
            className="w-auto max-h-(--radix-popover-content-available-height) overflow-y-auto p-0"
          >
            <Calendar
              autoFocus
              disabled={isLoading}
              mode="single"
              month={currentMonth}
              selected={parsed}
              onMonthChange={setCurrentMonth}
              onSelect={isReadOnly ? undefined : handleSelect}
            />

            {!dateOnly && (
              <>
                <Separator />

                <div className="flex flex-col gap-2 p-3">
                  <FormLabel className="text-xs text-muted-foreground" htmlFor={`${id}-time`}>
                    {t("Common.datePresets.startTime")}
                  </FormLabel>

                  <TimeInput
                    disabled={isLoading}
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
                  disabled={isLoading}
                  size="sm"
                  type="button"
                  variant="secondary"
                  onClick={isReadOnly ? undefined : () => handlePreset(preset.compute)}
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
