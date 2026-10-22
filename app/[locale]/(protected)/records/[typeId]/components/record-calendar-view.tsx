"use client";

import type { ChipColor } from "@/constants/chip-colors";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import type { CalendarViewMode } from "@/core/data-view/calendar-view-config.schema";
import type { CalendarDate } from "@/features/record-calendar/calendar-date";
import type { RecordRow } from "@/features/records/record-presentation";
import type { RecordsStore } from "./records.store";
import type { CalendarItem, CalendarSegment, CalendarWeekLayout } from "./record-calendar-layout";

import { useDroppable } from "@dnd-kit/core";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";

import { useRecordValueFormat } from "@/components/records/record-value";
import { CalendarEntryTooltip, useCalendarEntryDateLabel } from "@/components/records/calendar-entry-tooltip";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { ITEM_REVEAL_CLASS } from "@/components/ui/item-actions";
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Spinner } from "@/components/ui/spinner";
import { CALENDAR_VIEW_MODES } from "@/core/data-view/calendar-view-config.schema";
import { cn } from "@/core/utils/cn";
import { useIsWiderThan } from "@/hooks/use-media-query";
import {
  addCalendarDays,
  calendarDateInstant,
  calendarDateParts,
  calendarDatesBetween,
  calendarMonthWeeks,
  startOfCalendarWeek,
} from "@/features/record-calendar/calendar-date";
import { shiftCalendarAnchor } from "@/features/record-calendar/calendar-window";
import { zonedDate } from "@/features/record-calendar/zoned-time";

import {
  CALENDAR_MONTH_LANES,
  calendarAgendaDays,
  calendarEntryColor,
  calendarEntryColorStyle,
  calendarItems,
  calendarItemsOn,
  editCalendarItems,
  hiddenCalendarItemsOn,
  layoutCalendarWeek,
} from "./record-calendar-layout";
import { CalendarDrag, CalendarResizeHandle, useCalendarDrag, useCalendarDraggable } from "./record-calendar-drag";

export type RecordCalendarViewStore = Pick<
  RecordsStore,
  | "calendar"
  | "calendarFields"
  | "calendarFocusDate"
  | "calendarMode"
  | "calendarRange"
  | "calendarResultSeq"
  | "calendarWindow"
  | "canCreateCalendarRecord"
  | "canMoveCalendarRecord"
  | "canResizeCalendarRecord"
  | "createCalendarRecord"
  | "isRefreshing"
  | "items"
  | "moveCalendarRecord"
  | "refreshQuery"
  | "setCalendarAnchor"
  | "setCalendarDisplayMode"
  | "setViewOptions"
> & {
  normalizedCalendarItems?: () => CalendarItem[];
  calendarColorForItem?: (item: CalendarItem) => ChipColor;
};
type Props = {
  store: RecordCalendarViewStore;
  hideToolbar?: boolean;
  recordName: (record: RecordRow) => string;
  onOpenRecord: (record: RecordRow, returnFocusTo?: HTMLElement | null) => void;
};

function useCalendarFormats(timeZone?: string) {
  const valueFormat = useRecordValueFormat();
  const day = (date: CalendarDate, options: Intl.DateTimeFormatOptions) =>
    valueFormat.date(calendarDateInstant(date), { ...options, timeZone: "UTC" });
  return {
    fullDate: (date: CalendarDate) => day(date, { dateStyle: "full" }),
    dayNumber: (date: CalendarDate) => day(date, { day: "numeric" }),
    weekday: (date: CalendarDate) => day(date, { weekday: "short" }),
    month: (date: CalendarDate) => day(date, { month: "long", year: "numeric" }),
    shortDate: (date: CalendarDate) => day(date, { day: "numeric", month: "short", year: "numeric" }),
    time: (instant: string) => valueFormat.date(new Date(instant), { hour: "numeric", minute: "2-digit", timeZone }),
    entryDate: useCalendarEntryDateLabel(timeZone),
  };
}

type Formats = ReturnType<typeof useCalendarFormats>;

const CalendarEntry = observer(function CalendarEntry({
  store,
  item,
  segment,
  date,
  formats,
  recordName,
  onOpenRecord,
  compact = true,
  className,
  style,
}: {
  store: RecordCalendarViewStore;
  item: CalendarItem;
  segment?: CalendarSegment;
  date?: CalendarDate;
  formats: Formats;
  recordName: Props["recordName"];
  onOpenRecord: Props["onOpenRecord"];
  compact?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const t = useTranslations();
  const drag = useCalendarDrag();
  const movable = Boolean(segment) && store.canMoveCalendarRecord(item.record);
  const resizable = movable && store.canResizeCalendarRecord(item.record);
  const segmentStart = segment?.start ?? item.entry.start;
  const draggableId = `${item.record.id}:${segmentStart}`;
  const { attributes, listeners, setNodeRef } = useCalendarDraggable({
    id: draggableId,
    recordId: item.record.id,
    edge: "move",
    day: segmentStart,
    disabled: !movable,
  });
  const name = recordName(item.record);
  const color =
    store.calendarColorForItem?.(item) ?? calendarEntryColor(item.entry, store.calendarFields?.color ?? null);
  const showsTime = Boolean(item.entry.time) && (segment ? !segment.continuesBefore : date === item.entry.start);
  const dateLabel = formats.entryDate(item.entry);
  const dragKeyDown = (listeners as { onKeyDown?: (event: ReactKeyboardEvent<HTMLElement>) => void } | undefined)
    ?.onKeyDown;
  const open = (element: HTMLElement) => onOpenRecord(item.record, element);

  return (
    <CalendarEntryTooltip date={dateLabel} name={name}>
      <div
        ref={setNodeRef}
        {...(movable ? attributes : {})}
        {...(movable ? listeners : {})}
        aria-label={t("DataView.calendar.entryLabel", { name, date: dateLabel })}
        aria-roledescription={movable ? t("DataView.calendar.movableEntry") : undefined}
        className={cn(
          "group/entry relative flex min-w-0 cursor-pointer select-none items-center gap-1 rounded-sm px-1.5 text-left text-xs font-medium outline-none transition-[filter] hover:brightness-95 focus-visible:ring-[3px] focus-visible:ring-ring/50 motion-reduce:transition-none",
          compact ? "h-5" : "min-h-8 py-1",
          segment?.continuesBefore && "rounded-l-none",
          segment?.continuesAfter && "rounded-r-none",
          movable && "touch-manipulation",
          drag.pending.has(item.record.id) && "z-20 shadow-md ring-1 ring-ring/40",
          className,
        )}
        data-calendar-entry={item.record.id}
        data-calendar-entry-end={item.entry.end}
        data-calendar-entry-start={item.entry.start}
        role="button"
        style={{ ...calendarEntryColorStyle(color), ...style }}
        tabIndex={0}
        onClick={(event) => {
          if (drag.wasDragged()) return;
          open(event.currentTarget);
        }}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === "Enter" || (!movable && event.key === " ")) {
            event.preventDefault();
            open(event.currentTarget);
            return;
          }
          if (movable) dragKeyDown?.(event);
        }}
      >
        {resizable && segment && !segment.continuesBefore && (
          <CalendarResizeHandle day={segment.start} edge="start" id={draggableId} recordId={item.record.id} />
        )}

        {showsTime && item.entry.time && (
          <span className="shrink-0 tabular-nums opacity-80">{formats.time(item.entry.time)}</span>
        )}

        <span className={cn("min-w-0", compact ? "truncate" : "line-clamp-2")}>{name}</span>

        {resizable && segment && !segment.continuesAfter && (
          <CalendarResizeHandle day={segment.end} edge="end" id={draggableId} recordId={item.record.id} />
        )}
      </div>
    </CalendarEntryTooltip>
  );
});

const CalendarDayCell = observer(function CalendarDayCell({
  date,
  column,
  muted,
  today,
  droppable,
  formats,
  onCreate,
  children,
}: {
  date: CalendarDate;
  column: number;
  muted: boolean;
  today: boolean;
  droppable: boolean;
  formats: Formats;
  onCreate?: (date: CalendarDate, opener?: HTMLElement) => void;
  children?: ReactNode;
}) {
  const t = useTranslations();
  const { setNodeRef } = useDroppable({ id: date, data: { date }, disabled: !droppable });
  const cell = useRef<HTMLDivElement | null>(null);
  return (
    <div
      ref={(element) => {
        cell.current = element;
        setNodeRef(element);
      }}
      aria-label={formats.fullDate(date)}
      className={cn(
        "group/reveal relative flex items-start justify-between border-r border-b px-1.5 pt-1",
        column === 6 && "border-r-0",
        muted && "bg-muted/40",
      )}
      data-calendar-day={date}
      data-today={today || undefined}
      style={{ gridColumn: column + 1, gridRow: "1 / -1" }}
      onDoubleClick={(event) => {
        if (onCreate && event.target === event.currentTarget) onCreate(date, event.currentTarget);
      }}
    >
      {children}

      {onCreate && children && (
        <IconButton
          className={cn("size-6", ITEM_REVEAL_CLASS)}
          icon={Plus}
          iconClassName="size-3.5"
          label={t("DataView.calendar.createOn", { date: formats.fullDate(date) })}
          onClick={() => onCreate(date, cell.current ?? undefined)}
        />
      )}
    </div>
  );
});

function DayNumber({ date, today, formats }: { date: CalendarDate; today: boolean; formats: Formats }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex size-6 items-center justify-center rounded-full text-xs font-medium tabular-nums",
        today ? "bg-primary text-primary-foreground" : "text-muted-foreground",
      )}
    >
      {formats.dayNumber(date)}
    </span>
  );
}

const MoreEntries = observer(function MoreEntries({
  store,
  date,
  count,
  column,
  row,
  items,
  formats,
  recordName,
  onOpenRecord,
}: {
  store: RecordCalendarViewStore;
  date: CalendarDate;
  count: number;
  column: number;
  row: number;
  items: CalendarItem[];
  formats: Formats;
  recordName: Props["recordName"];
  onOpenRecord: Props["onOpenRecord"];
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  return (
    <div className="relative z-10 min-w-0 px-1" style={{ gridColumn: column + 1, gridRow: row }}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            aria-label={t("DataView.calendar.moreLabel", {
              count,
              date: formats.fullDate(date),
            })}
            className="h-5 rounded-sm px-1 text-[11px] font-medium text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
            data-calendar-more={date}
            type="button"
          >
            {t("DataView.calendar.more", { count })}
          </button>
        </PopoverTrigger>

        <PopoverContent align="start" className="w-72 p-0">
          <PopoverHeader className="px-3 pb-1 pt-3">
            <PopoverTitle>{formats.fullDate(date)}</PopoverTitle>
          </PopoverHeader>

          <div className="flex max-h-80 flex-col gap-1 overflow-y-auto px-3 pb-3" data-calendar-more-list={date}>
            {items.map((item) => (
              <CalendarEntry
                key={item.record.id}
                date={date}
                formats={formats}
                item={item}
                recordName={recordName}
                store={store}
                onOpenRecord={(record, element) => {
                  setOpen(false);
                  onOpenRecord(record, element);
                }}
              />
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
});

const CalendarWeekRow = observer(function CalendarWeekRow({
  store,
  layout,
  items,
  visibleLanes,
  month,
  today,
  droppable,
  showDayNumbers,
  formats,
  recordName,
  onOpenRecord,
}: {
  store: RecordCalendarViewStore;
  layout: CalendarWeekLayout;
  items: CalendarItem[];
  visibleLanes: number;
  month: number | null;
  today: CalendarDate;
  droppable: boolean;
  showDayNumbers: boolean;
  formats: Formats;
  recordName: Props["recordName"];
  onOpenRecord: Props["onOpenRecord"];
}) {
  const lanes = Math.min(layout.lanes, visibleLanes);
  const overflowing = layout.lanes > visibleLanes;
  const headRow = showDayNumbers ? "1.75rem " : "0.25rem ";
  return (
    <div
      className="relative grid min-h-0 flex-1 grid-cols-7 gap-y-0.5 overflow-hidden"
      data-calendar-week={layout.days[0]}
      style={{
        gridTemplateRows: `${headRow}${lanes ? `repeat(${lanes}, 1.25rem) ` : ""}${overflowing ? "1.25rem " : ""}1fr`,
      }}
    >
      {layout.days.map((date, column) => (
        <CalendarDayCell
          key={date}
          column={column}
          date={date}
          droppable={droppable}
          formats={formats}
          muted={month !== null && calendarDateParts(date).month !== month}
          today={date === today}
          onCreate={
            store.canCreateCalendarRecord ? (day, opener) => store.createCalendarRecord(day, null, opener) : undefined
          }
        >
          {showDayNumbers && <DayNumber date={date} formats={formats} today={date === today} />}
        </CalendarDayCell>
      ))}

      {layout.segments
        .filter((segment) => segment.lane < visibleLanes)
        .map((segment) => (
          <CalendarEntry
            key={`${segment.item.record.id}:${segment.start}`}
            className="relative z-10 mx-0.5"
            formats={formats}
            item={segment.item}
            recordName={recordName}
            segment={segment}
            store={store}
            style={{
              gridColumn: `${segment.column + 1} / span ${segment.span}`,
              gridRow: segment.lane + 2,
            }}
            onOpenRecord={onOpenRecord}
          />
        ))}

      {overflowing &&
        layout.days.map((date, column) => {
          const hidden = hiddenCalendarItemsOn(layout, date, visibleLanes);
          return hidden > 0 ? (
            <MoreEntries
              key={`more:${date}`}
              column={column}
              count={hidden}
              date={date}
              formats={formats}
              items={calendarItemsOn(items, date)}
              recordName={recordName}
              row={lanes + 2}
              store={store}
              onOpenRecord={onOpenRecord}
            />
          ) : null;
        })}
    </div>
  );
});

function WeekdayHeader({
  days,
  formats,
  withDates,
  today,
}: {
  days: CalendarDate[];
  formats: Formats;
  withDates: boolean;
  today: CalendarDate;
}) {
  return (
    <div aria-hidden className="grid shrink-0 grid-cols-7 border-b">
      {days.map((date) => (
        <div
          key={date}
          className={cn(
            "flex items-center gap-1.5 px-2 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground",
            withDates && date === today && "text-primary",
          )}
        >
          {formats.weekday(date)}

          {withDates && <DayNumber date={date} formats={formats} today={date === today} />}
        </div>
      ))}
    </div>
  );
}

const CalendarAgenda = observer(function CalendarAgenda({
  store,
  items,
  from,
  to,
  today,
  formats,
  recordName,
  onOpenRecord,
}: {
  store: RecordCalendarViewStore;
  items: CalendarItem[];
  from: CalendarDate;
  to: CalendarDate;
  today: CalendarDate;
  formats: Formats;
  recordName: Props["recordName"];
  onOpenRecord: Props["onOpenRecord"];
}) {
  const t = useTranslations();
  const days = calendarAgendaDays(items, from, to);
  if (days.length === 0) {
    return (
      <p className="p-6 text-center text-sm text-muted-foreground" data-calendar-empty="">
        {t("DataView.calendar.emptyRange")}
      </p>
    );
  }
  return (
    <ol className="flex flex-col divide-y" data-calendar-agenda="">
      {days.map(({ date, items: dayItems }) => (
        <li key={date} className="flex gap-3 px-4 py-3" data-calendar-agenda-day={date}>
          <div className={cn("w-12 shrink-0 text-center", date === today ? "text-primary" : "text-muted-foreground")}>
            <div className="text-lg font-semibold leading-none tabular-nums">{formats.dayNumber(date)}</div>

            <div className="text-[11px] uppercase tracking-wide">{formats.weekday(date)}</div>
          </div>

          <ul aria-label={formats.fullDate(date)} className="flex min-w-0 flex-1 flex-col gap-1">
            {dayItems.map((item) => (
              <li key={item.record.id}>
                <CalendarEntry
                  compact={false}
                  date={date}
                  formats={formats}
                  item={item}
                  recordName={recordName}
                  store={store}
                  onOpenRecord={onOpenRecord}
                />
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
});

const CalendarBody = observer(function CalendarBody({
  store,
  items,
  today,
  formats,
  recordName,
  onOpenRecord,
}: {
  store: RecordCalendarViewStore;
  items: CalendarItem[];
  today: CalendarDate;
  formats: Formats;
  recordName: Props["recordName"];
  onOpenRecord: Props["onOpenRecord"];
}) {
  const { pending } = useCalendarDrag();
  const calendarWindow = store.calendarWindow;
  if (!calendarWindow) return null;
  const shown = editCalendarItems(items, pending, calendarWindow.timeZone);
  const anchor = store.calendarFocusDate;
  const mode = store.calendarMode;
  const droppable = mode !== "agenda";
  if (mode === "agenda") {
    return (
      <CalendarAgenda
        formats={formats}
        from={calendarWindow.from}
        items={shown}
        recordName={recordName}
        store={store}
        to={calendarWindow.to}
        today={today}
        onOpenRecord={onOpenRecord}
      />
    );
  }
  if (mode === "week") {
    const days = calendarDatesBetween(calendarWindow.from, calendarWindow.to);
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <WeekdayHeader withDates days={days} formats={formats} today={today} />

        <CalendarWeekRow
          droppable={droppable}
          formats={formats}
          items={shown}
          layout={layoutCalendarWeek(shown, days)}
          month={null}
          recordName={recordName}
          showDayNumbers={false}
          store={store}
          today={today}
          visibleLanes={Number.POSITIVE_INFINITY}
          onOpenRecord={onOpenRecord}
        />
      </div>
    );
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <WeekdayHeader
        days={calendarDatesBetween(startOfCalendarWeek(anchor), addCalendarDays(startOfCalendarWeek(anchor), 6))}
        formats={formats}
        today={today}
        withDates={false}
      />

      <div className="flex min-h-0 flex-1 flex-col *:min-h-24">
        {calendarMonthWeeks(anchor).map((week) => (
          <CalendarWeekRow
            key={week[0]}
            showDayNumbers
            droppable={droppable}
            formats={formats}
            items={shown}
            layout={layoutCalendarWeek(shown, week)}
            month={calendarDateParts(anchor).month}
            recordName={recordName}
            store={store}
            today={today}
            visibleLanes={CALENDAR_MONTH_LANES}
            onOpenRecord={onOpenRecord}
          />
        ))}
      </div>
    </div>
  );
});

export const RecordCalendarView = observer(function RecordCalendarView({
  store,
  recordName,
  onOpenRecord,
  hideToolbar = false,
}: Props) {
  const t = useTranslations();
  const formats = useCalendarFormats(store.calendarWindow?.timeZone);
  const titleId = useId();
  const wide = useIsWiderThan("sm");
  const heal = useRef<{ key: string; attempts: number }>({
    key: "",
    attempts: 0,
  });
  const fields = store.calendarFields;
  const calendarWindow = store.calendarWindow;
  const range = store.calendarRange;
  const mode = store.calendarMode;
  const refreshing = store.isRefreshing;
  const windowKey = calendarWindow ? `${calendarWindow.from}:${calendarWindow.to}:${calendarWindow.timeZone}` : "";
  const rangeMatches = Boolean(
    calendarWindow && range && range.from === calendarWindow.from && range.to === calendarWindow.to,
  );

  useEffect(() => {
    store.setCalendarDisplayMode(wide ? null : "agenda");
  }, [store, wide]);

  useEffect(() => {
    if (!windowKey || rangeMatches || refreshing) return;
    if (heal.current.key !== windowKey) heal.current = { key: windowKey, attempts: 0 };
    if (heal.current.attempts >= 2) return;
    heal.current.attempts += 1;
    void store.refreshQuery().catch(() => undefined);
  }, [store, windowKey, rangeMatches, refreshing, store.calendarResultSeq]);

  if ((!fields && !store.normalizedCalendarItems) || !calendarWindow) return null;
  const timeZone = calendarWindow.timeZone;
  const today = zonedDate(new Date(), timeZone);
  const anchor = store.calendarFocusDate;
  const items = range
    ? (store.normalizedCalendarItems?.() ?? (fields ? calendarItems(store.items, fields, timeZone) : []))
    : [];
  const title =
    mode === "week"
      ? `${formats.shortDate(calendarWindow.from)} – ${formats.shortDate(calendarWindow.to)}`
      : formats.month(anchor);
  const modeLabels: Record<CalendarViewMode, string> = {
    month: t("DataView.calendar.modes.month"),
    week: t("DataView.calendar.modes.week"),
    agenda: t("DataView.calendar.modes.agenda"),
  };
  const stepLabels =
    mode === "week"
      ? { previous: t("DataView.calendar.previousWeek"), next: t("DataView.calendar.nextWeek") }
      : { previous: t("DataView.calendar.previousMonth"), next: t("DataView.calendar.nextMonth") };

  return (
    <CalendarDrag items={items} store={store} timeZone={timeZone}>
      <section
        aria-busy={refreshing || undefined}
        aria-labelledby={titleId}
        className="flex h-full min-h-0 flex-col animate-page-result-in motion-reduce:animate-none"
        data-calendar-mode={mode}
        data-slot="calendar-root"
      >
        {hideToolbar ? (
          <h2 className="sr-only" id={titleId}>
            {title}
          </h2>
        ) : (
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2">
            <div className="flex items-center">
              <IconButton
                icon={ChevronLeft}
                label={stepLabels.previous}
                onClick={() => store.setCalendarAnchor(shiftCalendarAnchor(mode, anchor, -1))}
              />

              <Button className="h-8" size="sm" variant="secondary" onClick={() => store.setCalendarAnchor(today)}>
                {t("Common.datePresets.today")}
              </Button>

              <IconButton
                icon={ChevronRight}
                label={stepLabels.next}
                onClick={() => store.setCalendarAnchor(shiftCalendarAnchor(mode, anchor, 1))}
              />
            </div>

            <h2 aria-live="polite" className="min-w-0 truncate text-sm font-semibold" id={titleId}>
              {title}
            </h2>

            {refreshing && <Spinner aria-label={t("Loading.text")} className="size-4 text-muted-foreground" />}

            {wide && store.calendar && (
              <SegmentedControl
                className="ml-auto"
                items={CALENDAR_VIEW_MODES.map((value) => ({
                  value,
                  label: modeLabels[value],
                  id: `records-calendar-mode-${value}`,
                  controls: false as const,
                }))}
                label={t("DataView.calendar.mode")}
                value={mode}
                onValueChange={(next) => {
                  if (store.calendar) {
                    store.setViewOptions({
                      calendar: { ...store.calendar, mode: next },
                    });
                  }
                }}
              />
            )}
          </div>
        )}

        {range?.truncated && rangeMatches && (
          <p className="shrink-0 border-b bg-warning/10 px-4 py-1.5 text-xs text-warning" data-calendar-truncated="">
            {t("DataView.calendar.truncated", {
              shown: store.items.length,
              total: range.total,
            })}
          </p>
        )}

        <div className={cn("flex min-h-0 flex-1 flex-col overflow-auto", refreshing && "opacity-70")}>
          <CalendarBody
            formats={formats}
            items={items}
            recordName={recordName}
            store={store}
            today={today}
            onOpenRecord={onOpenRecord}
          />
        </div>
      </section>
    </CalendarDrag>
  );
});
