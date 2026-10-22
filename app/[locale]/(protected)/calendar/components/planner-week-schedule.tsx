"use client";

import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import type { ChipColor } from "@/constants/chip-colors";
import type { PlannerEntry } from "@/features/planner/planner-entries";
import type { TimedPlannerPosition } from "@/features/planner/planner-week-layout";
import type { CalendarWindow } from "@/core/data-view/calendar-view-config.schema";
import type { CalendarDate } from "@/features/record-calendar/calendar-date";
import type { RecordCalendarViewStore } from "../../records/[typeId]/components/record-calendar-view";

import { useDroppable } from "@dnd-kit/core";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { useRecordValueFormat } from "@/components/records/record-value";
import { CalendarEntryTooltip, useCalendarEntryDateLabel } from "@/components/records/calendar-entry-tooltip";
import { cn } from "@/core/utils/cn";
import { calendarDatesBetween } from "@/features/record-calendar/calendar-date";
import { editCalendarEntry } from "@/features/record-calendar/calendar-entries";
import { layoutPlannerDay } from "@/features/planner/planner-week-layout";
import { calendarEntryColorStyle } from "../../records/[typeId]/components/record-calendar-layout";
import {
  CalendarDrag,
  CalendarResizeHandle,
  useCalendarDrag,
  useCalendarDraggable,
} from "../../records/[typeId]/components/record-calendar-drag";

const HOUR_HEIGHT = 48;
const CREATE_STEP_MINUTES = 30;

type ScheduleProps = {
  entries: PlannerEntry[];
  store: RecordCalendarViewStore;
  window: CalendarWindow;
  refreshing: boolean;
  name: (item: PlannerEntry) => string;
  color: (item: PlannerEntry) => ChipColor;
  onOpen: (item: PlannerEntry, opener: HTMLElement) => void;
  onCreate?: (date: CalendarDate, minutes: number, opener: HTMLElement, anchor: DOMRect) => void;
};

const ScheduleEntry = observer(function ScheduleEntry({
  position,
  day,
  store,
  name,
  date,
  color,
  timeZone,
  onOpen,
}: {
  position: TimedPlannerPosition;
  day: CalendarDate;
  timeZone: string;
  store: RecordCalendarViewStore;
  name: string;
  date: string;
  color: ChipColor;
  onOpen: ScheduleProps["onOpen"];
}) {
  const t = useTranslations();
  const format = useRecordValueFormat();
  const drag = useCalendarDrag();
  const { item, start, end, column, columns } = position;
  const row = store.items.find((candidate) => candidate.id === item.id);
  const movable = Boolean(row && store.canMoveCalendarRecord(row));
  const resizable = Boolean(row && movable && store.canResizeCalendarRecord(row));
  const id = `${item.id}:${day}`;
  const { attributes, listeners, setNodeRef } = useCalendarDraggable({
    id,
    recordId: item.id,
    edge: "move",
    day,
    disabled: !movable,
  });
  const dragKeyDown = (listeners as { onKeyDown?: (event: ReactKeyboardEvent<HTMLElement>) => void } | undefined)
    ?.onKeyDown;
  return (
    <CalendarEntryTooltip date={date} name={name} source={item.sourceLabel}>
      <div
        ref={setNodeRef}
        {...(movable ? attributes : {})}
        {...(movable ? listeners : {})}
        aria-label={t("DataView.calendar.entryLabel", { name, date })}
        aria-roledescription={movable ? t("DataView.calendar.movableEntry") : undefined}
        className={cn(
          "group/entry absolute cursor-pointer select-none overflow-hidden rounded-md border border-background px-1.5 py-1 text-left text-xs outline-none hover:brightness-95 focus-visible:z-20 focus-visible:ring-2 focus-visible:ring-ring",
          movable && "touch-manipulation",
          drag.pending.has(item.id) && "z-20 shadow-md ring-1 ring-ring/40",
        )}
        data-calendar-entry={item.id}
        data-calendar-entry-end={item.entry.end}
        data-calendar-entry-start={item.entry.start}
        data-planner-schedule-entry={item.id}
        role="button"
        style={{
          ...calendarEntryColorStyle(color),
          top: (start / 60) * HOUR_HEIGHT,
          height: Math.max(18, ((end - start) / 60) * HOUR_HEIGHT),
          left: `${(column / columns) * 100}%`,
          width: `${100 / columns}%`,
        }}
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
        {resizable && item.entry.start === day && (
          <CalendarResizeHandle vertical day={day} edge="start" id={id} recordId={item.id} />
        )}

        <span className="block truncate font-medium">{name}</span>

        {item.entry.time && item.entry.start === day && (
          <span className="block truncate tabular-nums opacity-80">
            {format.date(new Date(item.entry.time), { hour: "numeric", minute: "2-digit", timeZone })}
          </span>
        )}

        {resizable && item.entry.end === day && (
          <CalendarResizeHandle vertical day={day} edge="end" id={id} recordId={item.id} />
        )}
      </div>
    </CalendarEntryTooltip>
  );
});

function ScheduleDay({
  day,
  children,
  onCreate,
}: {
  day: CalendarDate;
  children: ReactNode;
  onCreate?: ScheduleProps["onCreate"];
}) {
  const { setNodeRef } = useDroppable({ id: day, data: { date: day } });
  return (
    <div
      ref={setNodeRef}
      className="relative border-l"
      data-calendar-day={day}
      data-planner-schedule-day={day}
      style={{
        backgroundImage: "linear-gradient(to bottom, var(--border) 1px, transparent 1px)",
        backgroundSize: `100% ${HOUR_HEIGHT}px`,
      }}
      onDoubleClick={(event) => {
        if (!onCreate || event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const step = Math.floor(((event.clientY - rect.top) / HOUR_HEIGHT) * (60 / CREATE_STEP_MINUTES));
        const minutes = Math.min(24 * 60 - CREATE_STEP_MINUTES, Math.max(0, step * CREATE_STEP_MINUTES));
        const top = rect.top + (minutes / 60) * HOUR_HEIGHT;
        onCreate(day, minutes, event.currentTarget, new DOMRect(rect.left, top, rect.width, HOUR_HEIGHT / 2));
      }}
    >
      {children}
    </div>
  );
}

const ScheduleGrid = observer(function ScheduleGrid({
  entries,
  store,
  window,
  name,
  color,
  onOpen,
  onCreate,
}: Omit<ScheduleProps, "refreshing">) {
  const format = useRecordValueFormat();
  const dateLabel = useCalendarEntryDateLabel(window.timeZone);
  const { pending } = useCalendarDrag();
  const shown = entries.map((item) => ({
    ...item,
    entry: editCalendarEntry(item.entry, pending.get(item.id), window.timeZone),
  }));
  const days = calendarDatesBetween(window.from, window.to);
  return (
    <div
      className="relative grid min-w-0 grid-cols-[3rem_repeat(7,minmax(0,1fr))]"
      style={{ height: 24 * HOUR_HEIGHT }}
    >
      <div aria-hidden className="sticky left-0 z-10 bg-background">
        {Array.from({ length: 24 }, (_, hour) => (
          <span
            key={hour}
            className="absolute right-2 text-[10px] tabular-nums text-muted-foreground"
            style={{ top: hour * HOUR_HEIGHT }}
          >
            {format.date(new Date(Date.UTC(2026, 0, 5, hour)), { hour: "numeric", timeZone: "UTC" })}
          </span>
        ))}
      </div>

      {days.map((day) => (
        <ScheduleDay key={day} day={day} onCreate={onCreate}>
          {layoutPlannerDay(shown, day, window.timeZone).map((position) => (
            <ScheduleEntry
              key={position.item.id}
              color={color(position.item)}
              date={dateLabel(position.item.entry)}
              day={day}
              name={name(position.item)}
              position={position}
              store={store}
              timeZone={window.timeZone}
              onOpen={onOpen}
            />
          ))}
        </ScheduleDay>
      ))}
    </div>
  );
});

export function PlannerWeekSchedule(props: ScheduleProps) {
  const scroll = useRef<HTMLDivElement>(null);
  const { store, window, refreshing } = props;
  useEffect(() => {
    if (scroll.current) scroll.current.scrollTop = 7 * HOUR_HEIGHT;
  }, [window.from]);
  return (
    <div
      ref={scroll}
      className={cn("min-h-64 flex-1 overflow-auto border-t", refreshing && "opacity-70")}
      data-planner-week-schedule=""
    >
      <CalendarDrag
        items={store.normalizedCalendarItems?.() ?? []}
        pixelsPerMinute={HOUR_HEIGHT / 60}
        store={store}
        timeZone={window.timeZone}
      >
        <ScheduleGrid {...props} />
      </CalendarDrag>
    </div>
  );
}
