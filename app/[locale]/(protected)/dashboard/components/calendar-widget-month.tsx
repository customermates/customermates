"use client";

import type { KeyboardEvent } from "react";
import type { CalendarDate } from "@/features/record-calendar/calendar-date";
import type { RecordDisplayField } from "@/features/records/record-display-field.schema";
import type { CalculatedValue, RecordRef } from "@/features/records/record-model.schema";
import type { CalendarWidgetPreview } from "@/features/widget/preview-record-calendar-widget.interactor";
import type {
  CalendarWidgetData,
  CalendarWidgetItem,
  CalendarWidgetQuery,
  CalendarWidgetWindow,
} from "@/features/widget/record-calendar-widget.schema";

import { useId, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { CalendarEntryTooltip, useCalendarEntryDateLabel } from "@/components/records/calendar-entry-tooltip";
import { RecordValue, useRecordValueFormat } from "@/components/records/record-value";
import { TruncatedText } from "@/components/shared/truncated-text";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { runUserAction } from "@/core/errors/report-application-error";
import { useRootStore } from "@/core/stores/root-store.provider";
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
import { recordDisplayName } from "@/features/records/record-display-name";

import {
  type CalendarHeatLevel,
  CALENDAR_HEAT_CLASS,
  CALENDAR_HEAT_LEVELS,
  calendarDayItems,
  calendarHeatLevels,
  calendarMonthGrid,
  calendarWidgetEntry,
} from "./calendar-widget-view";
import { WIDGET_INTERACTIVE_ATTRIBUTE } from "./widget-interaction";

type Props = {
  data: CalendarWidgetData;
  query: CalendarWidgetQuery;
  amountField: RecordDisplayField | undefined;
  singular: string | undefined;
  loadWindow: (window: CalendarWidgetWindow) => Promise<CalendarWidgetPreview>;
  recordHref?: (record: RecordRef) => string;
};

type DayRecords =
  | { date: CalendarDate; state: "ready"; items: CalendarWidgetItem[]; truncated: boolean }
  | { date: CalendarDate; state: "loading" }
  | { date: CalendarDate; state: "failed" };

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
  amountField,
  singular,
  loadWindow,
  recordHref,
}: Props) {
  const t = useTranslations();
  const valueFormat = useRecordValueFormat();
  const root = useRootStore();
  const entryDate = useCalendarEntryDateLabel(query.timeZone);
  const monthLabelId = useId();
  const month = useMonthWindow(initial, loadWindow);
  const [openDate, setOpenDate] = useState<CalendarDate | null>(null);
  const [dayRecords, setDayRecords] = useState<DayRecords | null>(null);
  const [focusDate, setFocusDate] = useState<CalendarDate | null>(null);
  const dayRequest = useRef(0);
  const buttons = useRef(new Map<CalendarDate, HTMLButtonElement>());
  const popoverContent = useRef<HTMLDivElement | null>(null);
  const data = month.data;
  const today = initial.today;
  const weeks = calendarMonthGrid(month.anchor);
  const levels = data ? calendarHeatLevels(data.days, query.aggregation) : new Map<CalendarDate, CalendarHeatLevel>();
  const monthLabel = valueFormat.date(calendarDateInstant(month.anchor), {
    month: "long",
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

  async function openDay(date: CalendarDate) {
    const current = ++dayRequest.current;
    setOpenDate(date);
    if (data && !data.truncated) {
      setDayRecords({ date, state: "ready", items: calendarDayItems(data.items, date), truncated: false });
      return;
    }
    setDayRecords({ date, state: "loading" });
    try {
      const result = await loadWindow({ from: date, to: date });
      if (current === dayRequest.current) {
        setDayRecords({
          date,
          state: "ready",
          items: calendarDayItems(result.data.items, date),
          truncated: result.data.truncated,
        });
      }
    } catch {
      if (current === dayRequest.current) setDayRecords({ date, state: "failed" });
    }
  }

  function closeDay() {
    dayRequest.current += 1;
    setOpenDate(null);
    setDayRecords(null);
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
    const fullDate = valueFormat.date(calendarDateInstant(date), { dateStyle: "full", timeZone: "UTC" });
    return sum
      ? t("RecordCalendarWidgets.dayLabelWithSum", { date: fullDate, count, sum })
      : t("RecordCalendarWidgets.dayLabel", { date: fullDate, count });
  }

  function renderDayRecords(date: CalendarDate) {
    const records = dayRecords?.date === date ? dayRecords : null;
    if (!records || records.state === "loading") {
      return (
        <div className="flex items-center gap-2 px-4 pb-4 text-sm text-muted-foreground">
          <Spinner aria-label={t("Loading.text")} className="size-4" />
        </div>
      );
    }
    if (records.state === "failed") {
      return (
        <div className="space-y-2 px-4 pb-4">
          <p className="text-sm text-destructive" role="alert">
            {t("RecordCalendarWidgets.dayFailed")}
          </p>

          <Button size="sm" type="button" variant="secondary" onClick={() => runUserAction(() => openDay(date))}>
            {t("ErrorCard.retry")}
          </Button>
        </div>
      );
    }
    if (records.items.length === 0)
      return <p className="px-4 pb-4 text-sm text-muted-foreground">{t("RecordCalendarWidgets.dayEmpty")}</p>;
    return (
      <>
        <ul className="pb-2" data-calendar-day-records={date}>
          {records.items.map((item) => {
            const name = recordDisplayName(item.title, singular, t);
            const href = recordHref?.(item.record);
            const amount = amountField && (
              <span className="shrink-0 text-xs">
                <RecordValue compact field={amountField} result={item.amount ?? { state: "missing" }} />
              </span>
            );
            return (
              <li key={item.record.recordId}>
                {href ? (
                  <CalendarEntryTooltip date={entryDate(calendarWidgetEntry(item))} name={name}>
                    <a
                      className="flex items-center gap-3 px-4 py-1.5 text-sm outline-none transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50"
                      href={href}
                      onClick={(event) => {
                        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button === 1) return;
                        event.preventDefault();
                        const opener = buttons.current.get(date);
                        closeDay();
                        root.recordWorkspaceStore.open(item.record, event.currentTarget, opener);
                      }}
                    >
                      <span className="min-w-0 flex-1 truncate">{name}</span>

                      {amount}
                    </a>
                  </CalendarEntryTooltip>
                ) : (
                  <span className="flex items-center gap-3 px-4 py-1.5 text-sm">
                    <TruncatedText className="flex-1">{name}</TruncatedText>

                    {amount}
                  </span>
                )}
              </li>
            );
          })}
        </ul>

        {records.truncated && (
          <p className="px-4 pb-3 text-xs text-muted-foreground">
            {t("RecordCalendarWidgets.dayTruncated", { count: records.items.length })}
          </p>
        )}
      </>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2" data-calendar-layout="month" data-calendar-month={month.anchor}>
      <div className="flex items-center gap-2">
        <span aria-live="polite" className="min-w-0 flex-1 truncate text-sm font-medium" id={monthLabelId}>
          {monthLabel}
        </span>

        {month.loading && <Spinner aria-label={t("Loading.text")} className="size-4 text-muted-foreground" />}

        <div className="flex shrink-0 items-center">
          <IconButton
            icon={ChevronLeft}
            label={t("RecordCalendarWidgets.previousMonth")}
            onClick={() => {
              closeDay();
              month.navigate(-1);
            }}
          />

          <IconButton
            icon={ChevronRight}
            label={t("RecordCalendarWidgets.nextMonth")}
            onClick={() => {
              closeDay();
              month.navigate(1);
            }}
          />
        </div>
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
                  <Popover
                    open={openDate === date}
                    onOpenChange={(open) => {
                      if (open) runUserAction(() => openDay(date));
                      else closeDay();
                    }}
                  >
                    <PopoverTrigger asChild>
                      <button
                        ref={(element) => {
                          if (element) buttons.current.set(date, element);
                          else buttons.current.delete(date);
                        }}
                        aria-label={dayLabel(date)}
                        className={cn(
                          "flex size-full items-start justify-end rounded-md px-1 py-0.5 text-[11px] font-medium tabular-nums outline-none transition-[box-shadow] focus-visible:ring-[3px] focus-visible:ring-ring/50 motion-reduce:transition-none",
                          CALENDAR_HEAT_CLASS[levels.get(date) ?? 0],
                          date === today && "outline-2 outline-offset-1 outline-ring",
                        )}
                        data-calendar-day={date}
                        data-heat={levels.get(date) ?? 0}
                        data-today={date === today || undefined}
                        tabIndex={date === activeDate ? 0 : -1}
                        type="button"
                        onFocus={() => setFocusDate(date)}
                        onKeyDown={(event) => moveFocus(event, date)}
                      >
                        {valueFormat.date(calendarDateInstant(date), { day: "numeric", timeZone: "UTC" })}
                      </button>
                    </PopoverTrigger>

                    <PopoverContent
                      ref={popoverContent}
                      align="start"
                      aria-label={valueFormat.date(calendarDateInstant(date), { dateStyle: "full", timeZone: "UTC" })}
                      className="w-80 p-0"
                      tabIndex={-1}
                      {...{ [WIDGET_INTERACTIVE_ATTRIBUTE]: "true" }}
                      onOpenAutoFocus={() => popoverContent.current?.focus()}
                    >
                      <PopoverHeader className="px-4 pb-2 pt-3">
                        <PopoverTitle>
                          {valueFormat.date(calendarDateInstant(date), { dateStyle: "full", timeZone: "UTC" })}
                        </PopoverTitle>

                        <PopoverDescription className="text-xs">
                          {(() => {
                            const { count, sum } = daySummary(date);
                            return sum
                              ? t("RecordCalendarWidgets.daySummaryWithSum", { count, sum })
                              : t("RecordCalendarWidgets.daySummary", { count });
                          })()}
                        </PopoverDescription>
                      </PopoverHeader>

                      {renderDayRecords(date)}
                    </PopoverContent>
                  </Popover>
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
