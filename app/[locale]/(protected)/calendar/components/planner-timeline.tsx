"use client";

import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from "react";
import type { ChipColor } from "@/constants/chip-colors";
import type { PlannerEntry } from "@/features/planner/planner-entries";
import type { CalendarWindow } from "@/core/data-view/calendar-view-config.schema";
import type { CalendarDate } from "@/features/record-calendar/calendar-date";
import type { TimelineSpan } from "@/features/planner/planner-timeline-layout";
import type { RecordCalendarViewStore } from "../../records/[typeId]/components/record-calendar-view";

import { useDroppable } from "@dnd-kit/core";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRecordValueFormat } from "@/components/records/record-value";
import { CalendarEntryTooltip, useCalendarEntryDateLabel } from "@/components/records/calendar-entry-tooltip";
import { cn } from "@/core/utils/cn";
import {
  addCalendarDays,
  calendarDateInstant,
  calendarDateParts,
  calendarDatesBetween,
  calendarDayDifference,
  calendarWeekdayIndex,
} from "@/features/record-calendar/calendar-date";
import { editCalendarEntry } from "@/features/record-calendar/calendar-entries";
import { zonedDate } from "@/features/record-calendar/zoned-time";
import {
  TIMELINE_LABEL_GAP,
  layoutPlannerTimeline,
  timelineLabelInside,
  timelineSpan,
} from "@/features/planner/planner-timeline-layout";
import { calendarEntryColorStyle, calendarSwatchStyle } from "../../records/[typeId]/components/record-calendar-layout";
import {
  CalendarDrag,
  CalendarResizeHandle,
  useCalendarDrag,
  useCalendarDraggable,
} from "../../records/[typeId]/components/record-calendar-drag";

export type PlannerTimelineScale = "day" | "week";
export type PlannerTimelineGroup = { id: string; label: string; color: ChipColor };

const GROUP_WIDTH = 208;
const DAY_WIDTH = 36;
const MIN_WEEK_DAY_WIDTH = 10;
const LANE_HEIGHT = 32;
const BAR_INSET = 4;
const MIN_MONTH_LABEL_WIDTH = 96;

type TimelineProps = {
  entries: PlannerEntry[];
  groups: PlannerTimelineGroup[];
  store: RecordCalendarViewStore;
  window: CalendarWindow;
  scale: PlannerTimelineScale;
  refreshing: boolean;
  name: (item: PlannerEntry) => string;
  color: (item: PlannerEntry) => ChipColor;
  onOpen: (item: PlannerEntry, opener: HTMLElement) => void;
  onCreate?: (sourceId: string, date: CalendarDate, opener: HTMLElement) => void;
};

function TimelineDay({
  date,
  offset,
  dayWidth,
  weekend,
}: {
  date: CalendarDate;
  offset: number;
  dayWidth: number;
  weekend: boolean;
}) {
  const { setNodeRef } = useDroppable({ id: date, data: { date } });
  return (
    <div
      ref={setNodeRef}
      className={cn("absolute inset-y-0", weekend && "bg-muted/50")}
      data-calendar-day={date}
      style={{ left: offset * dayWidth, width: dayWidth }}
    />
  );
}

const TimelineBarView = observer(function TimelineBarView({
  item,
  span,
  lane,
  dayWidth,
  store,
  name,
  date,
  color,
  onOpen,
}: {
  item: PlannerEntry;
  span: TimelineSpan;
  lane: number;
  dayWidth: number;
  store: RecordCalendarViewStore;
  name: string;
  date: string;
  color: ChipColor;
  onOpen: TimelineProps["onOpen"];
}) {
  const t = useTranslations();
  const drag = useCalendarDrag();
  const row = store.items.find((candidate) => candidate.id === item.id);
  const movable = Boolean(row && store.canMoveCalendarRecord(row));
  const resizable = Boolean(row && movable && store.canResizeCalendarRecord(row));
  const id = `${item.id}:timeline`;
  const { attributes, listeners, setNodeRef } = useCalendarDraggable({
    id,
    recordId: item.id,
    edge: "move",
    day: span.start,
    disabled: !movable,
  });
  const dragKeyDown = (listeners as { onKeyDown?: (event: ReactKeyboardEvent<HTMLElement>) => void } | undefined)
    ?.onKeyDown;
  const inside = timelineLabelInside(span.span, dayWidth, name);
  const style: CSSProperties = {
    ...calendarEntryColorStyle(color),
    left: span.offset * dayWidth + 1,
    width: Math.max(span.span * dayWidth - 2, 6),
    top: lane * LANE_HEIGHT + BAR_INSET,
    height: LANE_HEIGHT - BAR_INSET * 2,
  };
  return (
    <CalendarEntryTooltip date={date} name={name} source={item.sourceLabel}>
      <div
        ref={setNodeRef}
        {...(movable ? attributes : {})}
        {...(movable ? listeners : {})}
        aria-label={t("DataView.calendar.entryLabel", { name, date })}
        aria-roledescription={movable ? t("DataView.calendar.movableEntry") : undefined}
        className={cn(
          "group/entry absolute flex cursor-pointer select-none items-center rounded-md text-xs font-medium outline-none transition-[filter,box-shadow] hover:brightness-95 focus-visible:ring-[3px] focus-visible:ring-ring/50 motion-reduce:transition-none",
          span.continuesBefore && "rounded-l-none",
          span.continuesAfter && "rounded-r-none",
          movable && "touch-manipulation",
          drag.pending.has(item.id) && "z-10 shadow-md ring-1 ring-ring/40",
        )}
        data-calendar-entry={item.id}
        data-calendar-entry-end={item.entry.end}
        data-calendar-entry-start={item.entry.start}
        data-planner-timeline-bar=""
        role="button"
        style={style}
        tabIndex={0}
        onClick={(event) => {
          if (!drag.wasDragged()) onOpen(item, event.currentTarget);
        }}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === "Enter" || (!movable && event.key === " ")) {
            event.preventDefault();
            onOpen(item, event.currentTarget);
            return;
          }
          if (movable) dragKeyDown?.(event);
        }}
      >
        {resizable && !span.continuesBefore && (
          <CalendarResizeHandle day={span.start} edge="start" id={id} recordId={item.id} />
        )}

        <span
          className={cn(
            "pointer-events-none truncate",
            inside
              ? "sticky min-w-0 px-2"
              : "absolute left-full max-w-60 whitespace-nowrap text-foreground/80 group-hover/entry:text-foreground",
          )}
          style={inside ? { left: GROUP_WIDTH } : { marginLeft: TIMELINE_LABEL_GAP }}
        >
          {name}
        </span>

        {resizable && !span.continuesAfter && (
          <CalendarResizeHandle day={span.end} edge="end" id={id} recordId={item.id} />
        )}
      </div>
    </CalendarEntryTooltip>
  );
});

const TimelineGrid = observer(function TimelineGrid({
  entries,
  groups,
  store,
  window,
  scale,
  name,
  color,
  onOpen,
  onCreate,
  dayWidth,
}: Omit<TimelineProps, "refreshing"> & { dayWidth: number }) {
  const t = useTranslations();
  const format = useRecordValueFormat();
  const dateLabel = useCalendarEntryDateLabel(window.timeZone);
  const { pending } = useCalendarDrag();
  const days = calendarDatesBetween(window.from, window.to);
  const trackWidth = days.length * dayWidth;
  const today = zonedDate(new Date(), window.timeZone);
  const todayOffset = calendarDayDifference(window.from, today);
  const day = (date: CalendarDate, options: Intl.DateTimeFormatOptions) =>
    format.date(calendarDateInstant(date), { ...options, timeZone: "UTC" });
  const months = days.filter((date, index) => index === 0 || calendarDateParts(date).day === 1);
  const weeks = days.filter((date) => calendarWeekdayIndex(date) === 0);
  const ticks = scale === "day" ? days : weeks;
  const tickWidth = scale === "day" ? dayWidth : dayWidth * 7;
  return (
    <div className="relative flex min-h-full min-w-full flex-col" style={{ width: GROUP_WIDTH + trackWidth }}>
      <div aria-hidden className="absolute inset-y-0" style={{ left: GROUP_WIDTH, width: trackWidth }}>
        {days.map((date, index) => (
          <TimelineDay
            key={date}
            date={date}
            dayWidth={dayWidth}
            offset={index}
            weekend={scale === "day" && calendarWeekdayIndex(date) >= 5}
          />
        ))}

        {scale === "week" &&
          weeks.map((date) => (
            <span
              key={date}
              className="absolute inset-y-0 border-l border-border/50"
              style={{ left: calendarDayDifference(window.from, date) * dayWidth }}
            />
          ))}

        {months.slice(1).map((date) => (
          <span
            key={date}
            className="absolute inset-y-0 border-l"
            style={{ left: calendarDayDifference(window.from, date) * dayWidth }}
          />
        ))}

        {todayOffset >= 0 && todayOffset < days.length && (
          <span
            className="absolute inset-y-0 w-px bg-primary"
            data-planner-today=""
            style={{ left: (todayOffset + 0.5) * dayWidth }}
          />
        )}
      </div>

      <div className="sticky top-0 z-30 flex shrink-0 border-b bg-background">
        <div className="sticky left-0 z-10 shrink-0 border-r bg-background" style={{ width: GROUP_WIDTH }} />

        <div aria-hidden className="relative h-12 shrink-0" style={{ width: trackWidth }}>
          <div className="absolute inset-x-0 top-0 flex h-6">
            {months.map((date, index) => {
              const next = months[index + 1];
              const width =
                (next ? calendarDayDifference(date, next) : calendarDayDifference(date, window.to) + 1) * dayWidth;
              return (
                <span
                  key={date}
                  className={cn("relative h-full shrink-0", index > 0 && "border-l")}
                  data-planner-timeline-month={date}
                  style={{ width }}
                >
                  {width >= MIN_MONTH_LABEL_WIDTH && (
                    <span
                      className="sticky inline-block whitespace-nowrap px-2 pt-1.5 text-xs font-semibold"
                      style={{ left: GROUP_WIDTH }}
                    >
                      {day(date, { month: "long", year: "numeric" })}
                    </span>
                  )}
                </span>
              );
            })}
          </div>

          {ticks.map((date) => {
            const isToday = scale === "day" ? date === today : today >= date && today <= addCalendarDays(date, 6);
            return (
              <span
                key={date}
                className={cn(
                  "absolute top-6 flex h-6 items-center text-[11px] tabular-nums",
                  scale === "day" ? "justify-center" : "px-1.5",
                  scale === "day" && calendarWeekdayIndex(date) >= 5
                    ? "text-muted-foreground/70"
                    : "text-muted-foreground",
                )}
                data-planner-timeline-tick={date}
                style={{ left: calendarDayDifference(window.from, date) * dayWidth, width: tickWidth }}
              >
                <span
                  className={cn(
                    "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1",
                    isToday && "bg-primary font-medium text-primary-foreground",
                  )}
                >
                  {scale === "day" ? day(date, { day: "numeric" }) : day(date, { day: "numeric", month: "short" })}
                </span>
              </span>
            );
          })}
        </div>
      </div>

      {groups.map((group) => {
        const items = entries
          .filter((item) => item.sourceId === group.id)
          .map((item) => ({ item, entry: editCalendarEntry(item.entry, pending.get(item.id), window.timeZone) }));
        const { bars, lanes } = layoutPlannerTimeline(
          entries.filter((item) => item.sourceId === group.id),
          { entry: (item) => item.entry, label: name, from: window.from, to: window.to, dayWidth },
        );
        const laneOf = new Map(bars.map((bar) => [bar.item.id, bar.lane]));
        return (
          <div key={group.id} className="flex shrink-0 border-b" data-planner-timeline-group={group.id}>
            <div
              className="sticky left-0 z-20 shrink-0 border-r bg-background px-3 py-2.5 text-sm"
              style={{ width: GROUP_WIDTH }}
            >
              <div className="sticky top-12 flex items-start gap-2">
                <span
                  aria-hidden
                  className="mt-1.5 size-2 shrink-0 rounded-full"
                  style={calendarSwatchStyle(group.color)}
                />

                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{group.label}</span>

                  <span className="block text-xs text-muted-foreground">
                    {t("Planner.entryCount", { count: bars.length })}
                  </span>
                </span>
              </div>
            </div>

            <div
              className="relative shrink-0"
              data-planner-timeline-track={group.id}
              style={{ width: trackWidth, height: Math.max(1, lanes) * LANE_HEIGHT + BAR_INSET * 2 }}
              onDoubleClick={(event) => {
                if (!onCreate || event.target !== event.currentTarget) return;
                const offset = Math.floor(
                  (event.clientX - event.currentTarget.getBoundingClientRect().left) / dayWidth,
                );
                onCreate(group.id, addCalendarDays(window.from, offset), event.currentTarget);
              }}
            >
              {items.map(({ item, entry }) => {
                const span = timelineSpan(entry, window.from, window.to);
                const lane = laneOf.get(item.id);
                if (!span || lane === undefined) return null;
                return (
                  <TimelineBarView
                    key={item.id}
                    color={color(item)}
                    date={dateLabel(entry)}
                    dayWidth={dayWidth}
                    item={{ ...item, entry }}
                    lane={lane}
                    name={name(item)}
                    span={span}
                    store={store}
                    onOpen={onOpen}
                  />
                );
              })}
            </div>
          </div>
        );
      })}

      <div aria-hidden className="flex flex-1">
        <div className="sticky left-0 z-20 shrink-0 border-r bg-background" style={{ width: GROUP_WIDTH }} />
      </div>
    </div>
  );
});

export const PlannerTimeline = observer(function PlannerTimeline(props: TimelineProps) {
  const t = useTranslations();
  const scroll = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const { window, scale, store, refreshing } = props;
  const days = calendarDayDifference(window.from, window.to) + 1;
  const dayWidth =
    scale === "day" ? DAY_WIDTH : Math.max(MIN_WEEK_DAY_WIDTH, Math.floor(((width - GROUP_WIDTH) / days) * 100) / 100);
  useLayoutEffect(() => {
    const element = scroll.current;
    if (!element) return;
    const resize = new ResizeObserver(() => setWidth(element.clientWidth));
    resize.observe(element);
    setWidth(element.clientWidth);
    return () => resize.disconnect();
  }, []);
  useEffect(() => {
    const element = scroll.current;
    if (!element || scale !== "day") return;
    const offset = calendarDayDifference(window.from, zonedDate(new Date(), window.timeZone));
    element.scrollLeft = offset > 0 && offset < days ? Math.max(0, (offset - 3) * DAY_WIDTH) : 0;
  }, [window.from, window.timeZone, scale, days]);
  return (
    <div
      ref={scroll}
      aria-label={scale === "day" ? t("Planner.modes.timeline") : t("Planner.modes.quarter")}
      className={cn("relative min-h-0 flex-1 overflow-auto", refreshing && "opacity-70")}
      data-planner-scale={scale}
      data-planner-timeline=""
      role="region"
    >
      {(scale === "day" || width > 0) && (
        <CalendarDrag items={store.normalizedCalendarItems?.() ?? []} store={store} timeZone={window.timeZone}>
          <TimelineGrid {...props} dayWidth={dayWidth} />
        </CalendarDrag>
      )}
    </div>
  );
});
