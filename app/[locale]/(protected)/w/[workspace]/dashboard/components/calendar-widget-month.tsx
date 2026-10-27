"use client";

import type { KeyboardEvent } from "react";
import type { CalendarDate } from "@/features/record-calendar/calendar-date";
import type { CalculatedValue } from "@/features/records/record-model.schema";
import type { CalendarWidgetPreview } from "@/features/widget/preview-record-calendar-widget.interactor";
import type {
  CalendarWidgetData,
  CalendarWidgetQuery,
  CalendarWidgetWindow,
} from "@/features/widget/record-calendar-widget.schema";

import { useId, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { useRecordValueFormat } from "@/components/records/record-value";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { runUserAction } from "@/core/errors/report-application-error";
import { cn } from "@/core/utils/cn";
import {
  addCalendarDays,
  calendarDateInstant,
  calendarWeekdayIndex,
  endOfCalendarMonth,
  startOfCalendarMonth,
  startOfCalendarWeek,
} from "@/features/record-calendar/calendar-date";
import { CALENDAR_KEY_STEPS, shiftCalendarAnchor } from "@/features/record-calendar/calendar-window";

import {
  type CalendarHeatLevel,
  CALENDAR_HEAT_CLASS,
  CALENDAR_HEAT_LEVELS,
  calendarHeatLevels,
  calendarMonthGrid,
} from "./calendar-widget-view";

export type CalendarDaySelect = (date: CalendarDate, label: string, opener: HTMLElement) => void;

type Props = {
  data: CalendarWidgetData;
  query: CalendarWidgetQuery;
  loadWindow: (window: CalendarWidgetWindow) => Promise<CalendarWidgetPreview>;
  onSelectDay?: CalendarDaySelect;
};

function heatSwatches() {
  return (
    <span className="flex items-center gap-0.5">
      {CALENDAR_HEAT_LEVELS.map((level) => (
        <span key={level} className={cn("size-3 rounded-[3px]", CALENDAR_HEAT_CLASS[level])} />
      ))}
    </span>
  );
}

function useMonthWindow(initial: CalendarWidgetData, loadWindow: Props["loadWindow"]) {
  const initialAnchor = startOfCalendarMonth(initial.window.from);
  const [source, setSource] = useState(initial);
  const [anchor, setAnchor] = useState(initialAnchor);
  const [loaded, setLoaded] = useState<{ anchor: CalendarDate; data: CalendarWidgetData } | null>(null);
  const [failed, setFailed] = useState<CalendarDate | null>(null);
  const request = useRef(0);
  if (source !== initial) {
    setSource(initial);
    setAnchor(initialAnchor);
    setLoaded(null);
    setFailed(null);
    request.current += 1;
  }
  async function load(target: CalendarDate) {
    const current = ++request.current;
    setFailed(null);
    try {
      const view = await loadWindow({ from: startOfCalendarMonth(target), to: endOfCalendarMonth(target) });
      if (current === request.current) setLoaded({ anchor: target, data: view.data });
    } catch {
      if (current === request.current) setFailed(target);
    }
  }
  function navigate(step: number) {
    const next = shiftCalendarAnchor("month", anchor, step);
    setAnchor(next);
    if (next === initialAnchor) {
      request.current += 1;
      setFailed(null);
    } else if (loaded?.anchor !== next) runUserAction(() => load(next));
  }
  const data = anchor === initialAnchor ? initial : loaded?.anchor === anchor ? loaded.data : null;
  return {
    anchor,
    data,
    failed: failed === anchor && !data,
    loading: !data && failed !== anchor,
    navigate,
    retry: () => runUserAction(() => load(anchor)),
  };
}

export const CalendarWidgetMonth = observer(function CalendarWidgetMonth({
  data: initial,
  query,
  loadWindow,
  onSelectDay,
}: Props) {
  const t = useTranslations();
  const valueFormat = useRecordValueFormat();
  const monthLabelId = useId();
  const month = useMonthWindow(initial, loadWindow);
  const [focusDate, setFocusDate] = useState<CalendarDate | null>(null);
  const buttons = useRef(new Map<CalendarDate, HTMLButtonElement>());
  const data = month.data;
  const today = initial.today;
  const weeks = calendarMonthGrid(month.anchor);
  const levels = data ? calendarHeatLevels(data.days, query.aggregation) : new Map<CalendarDate, CalendarHeatLevel>();
  const monthLabel = valueFormat.date(calendarDateInstant(month.anchor), {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const shortMonthLabel = valueFormat.date(calendarDateInstant(month.anchor), {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  const firstDay = month.anchor;
  const lastDay = endOfCalendarMonth(month.anchor);
  const todayInMonth = today >= firstDay && today <= lastDay;
  const activeDate =
    focusDate && focusDate >= firstDay && focusDate <= lastDay ? focusDate : todayInMonth ? today : firstDay;
  const weekStart = startOfCalendarWeek(today);
  const weekdays = Array.from({ length: 7 }, (_, index) => calendarDateInstant(addCalendarDays(weekStart, index)));

  function daySummary(date: CalendarDate) {
    const day = data?.days.find((entry) => entry.date === date);
    const count = day?.count ?? 0;
    const sum = query.aggregation === "sum" && day ? formatResult(day.result) : null;
    return { count, sum };
  }

  function formatResult(result: CalculatedValue) {
    if (result.state !== "value" || result.value.kind !== "decimal") return null;
    return valueFormat.decimal(result.value.value, { currency: result.value.currency ?? null, compact: true });
  }

  function moveFocus(event: KeyboardEvent<HTMLButtonElement>, date: CalendarDate) {
    const weekday = calendarWeekdayIndex(date);
    const target =
      event.key in CALENDAR_KEY_STEPS
        ? addCalendarDays(date, CALENDAR_KEY_STEPS[event.key])
        : event.key === "Home"
          ? addCalendarDays(date, -weekday)
          : event.key === "End"
            ? addCalendarDays(date, 6 - weekday)
            : null;
    if (!target) return;
    event.preventDefault();
    const clamped = target < firstDay ? firstDay : target > lastDay ? lastDay : target;
    setFocusDate(clamped);
    buttons.current.get(clamped)?.focus();
  }

  function dayLabel(date: CalendarDate) {
    const { count, sum } = daySummary(date);
    return sum
      ? t("RecordCalendarWidgets.dayLabelWithSum", { date: fullDate(date), count, sum })
      : t("RecordCalendarWidgets.dayLabel", { date: fullDate(date), count });
  }

  function dayClass(date: CalendarDate) {
    return cn(
      "flex size-full items-start justify-end rounded-md px-1 py-0.5 text-[11px] font-medium tabular-nums outline-none transition-[box-shadow] focus-visible:ring-[3px] focus-visible:ring-ring/50 motion-reduce:transition-none",
      CALENDAR_HEAT_CLASS[levels.get(date) ?? 0],
      date === today && "ring-1 ring-foreground/70 ring-inset",
    );
  }

  function dayNumber(date: CalendarDate) {
    return valueFormat.date(calendarDateInstant(date), { day: "numeric", timeZone: "UTC" });
  }

  function fullDate(date: CalendarDate) {
    return valueFormat.date(calendarDateInstant(date), { dateStyle: "full", timeZone: "UTC" });
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-1" data-calendar-layout="month" data-calendar-month={month.anchor}>
      <div className="flex min-h-5 items-center gap-1 text-xs" data-calendar-month-nav="">
        <span aria-hidden className="min-w-0 flex-1 truncate font-medium" data-calendar-month-label="">
          {shortMonthLabel}
        </span>

        <span aria-live="polite" className="sr-only" id={monthLabelId}>
          {monthLabel}
        </span>

        <IconButton
          className="size-5"
          icon={ChevronLeft}
          iconClassName="size-3.5"
          label={t("RecordCalendarWidgets.previousMonth")}
          onClick={() => month.navigate(-1)}
        />

        <IconButton
          className="size-5"
          icon={ChevronRight}
          iconClassName="size-3.5"
          label={t("RecordCalendarWidgets.nextMonth")}
          onClick={() => month.navigate(1)}
        />
      </div>

      <div
        aria-busy={month.loading || undefined}
        aria-labelledby={monthLabelId}
        className={cn("flex min-h-0 flex-1 flex-col gap-1", month.loading && "opacity-60")}
        role="grid"
      >
        <div className="grid grid-cols-7 gap-1" role="row">
          {weekdays.map((weekday) => (
            <div
              key={weekday.toISOString()}
              aria-label={valueFormat.date(weekday, { weekday: "long", timeZone: "UTC" })}
              className="text-center text-[10px] font-medium text-muted-foreground"
              role="columnheader"
            >
              {valueFormat.date(weekday, { weekday: "narrow", timeZone: "UTC" })}
            </div>
          ))}
        </div>

        {weeks.map((week) => (
          <div key={week.find(Boolean) ?? ""} className="grid min-h-6 flex-1 grid-cols-7 gap-1" role="row">
            {week.map((date, index) =>
              date ? (
                <div key={date} className="min-h-0" role="gridcell">
                  {onSelectDay ? (
                    <button
                      ref={(element) => {
                        if (element) buttons.current.set(date, element);
                        else buttons.current.delete(date);
                      }}
                      aria-label={dayLabel(date)}
                      className={cn(dayClass(date), "cursor-pointer")}
                      data-calendar-day={date}
                      data-heat={levels.get(date) ?? 0}
                      data-today={date === today || undefined}
                      tabIndex={date === activeDate ? 0 : -1}
                      type="button"
                      onClick={(event) => onSelectDay(date, fullDate(date), event.currentTarget)}
                      onFocus={() => setFocusDate(date)}
                      onKeyDown={(event) => moveFocus(event, date)}
                    >
                      {dayNumber(date)}
                    </button>
                  ) : (
                    <div
                      aria-label={dayLabel(date)}
                      className={dayClass(date)}
                      data-calendar-day={date}
                      data-heat={levels.get(date) ?? 0}
                      data-today={date === today || undefined}
                      role="img"
                    >
                      {dayNumber(date)}
                    </div>
                  )}
                </div>
              ) : (
                <div key={`empty-${index}`} aria-hidden className="min-h-0" role="gridcell" />
              ),
            )}
          </div>
        ))}
      </div>

      {month.failed ? (
        <div className="flex items-center gap-2 text-xs" role="alert">
          <span className="text-destructive">{t("RecordCalendarWidgets.monthFailed")}</span>

          <Button size="sm" type="button" variant="secondary" onClick={month.retry}>
            {t("ErrorCard.retry")}
          </Button>
        </div>
      ) : (
        <div aria-hidden className="flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
          {query.aggregation === "sum"
            ? t.rich("RecordCalendarWidgets.scaleSum", { swatches: heatSwatches })
            : t.rich("RecordCalendarWidgets.scale", { swatches: heatSwatches })}
        </div>
      )}
    </div>
  );
});
