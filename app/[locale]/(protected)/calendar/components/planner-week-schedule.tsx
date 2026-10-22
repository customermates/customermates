"use client";

import type { PlannerEntry } from "@/features/planner/planner-entries";
import type { PlannerConfig } from "@/features/planner/planner.schema";
import type { CalendarWindow } from "@/core/data-view/calendar-view-config.schema";

import { useEffect, useRef } from "react";
import { useRecordValueFormat } from "@/components/records/record-value";
import { CalendarEntryTooltip } from "@/components/records/calendar-entry-tooltip";
import { usePlannerEntryDateLabel } from "./planner-entry-label";
import { cn } from "@/core/utils/cn";
import { calendarDatesBetween } from "@/features/record-calendar/calendar-date";
import { layoutPlannerDay } from "@/features/planner/planner-week-layout";
import { CALENDAR_ENTRY_COLOR_CLASS } from "../../records/[typeId]/components/record-calendar-layout";

export function PlannerWeekSchedule({
  entries,
  config,
  window,
  name,
  onOpen,
}: {
  entries: PlannerEntry[];
  config: PlannerConfig;
  window: CalendarWindow;
  name: (item: PlannerEntry) => string;
  onOpen: (item: PlannerEntry, opener: HTMLElement) => void;
}) {
  const format = useRecordValueFormat();
  const dateLabel = usePlannerEntryDateLabel(config.timeZone);
  const scroll = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scroll.current) scroll.current.scrollTop = 7 * 48;
  }, [window.from]);
  const days = calendarDatesBetween(window.from, window.to);
  return (
    <div ref={scroll} className="min-h-64 flex-1 overflow-auto border-t" data-planner-week-schedule="">
      <div className="relative grid min-w-0 grid-cols-[3rem_repeat(7,minmax(0,1fr))]" style={{ height: 24 * 48 }}>
        <div aria-hidden className="sticky left-0 z-10 bg-background">
          {Array.from({ length: 24 }, (_, hour) => (
            <span
              key={hour}
              className="absolute right-2 text-[10px] tabular-nums text-muted-foreground"
              style={{ top: hour * 48 }}
            >{`${String(hour).padStart(2, "0")}:00`}</span>
          ))}
        </div>

        {days.map((day) => (
          <div
            key={day}
            className="relative border-l"
            data-planner-schedule-day={day}
            style={{
              backgroundImage: "linear-gradient(to bottom, var(--border) 1px, transparent 1px)",
              backgroundSize: "100% 48px",
            }}
          >
            {layoutPlannerDay(entries, day, config.timeZone).map(({ item, start, end, column, columns }) => {
              const color = config.sources.find((source) => source.id === item.sourceId)?.color ?? "secondary";
              return (
                <CalendarEntryTooltip key={item.id} date={dateLabel(item)} name={name(item)} source={item.sourceLabel}>
                  <button
                    aria-label={`${name(item)} · ${dateLabel(item)}`}
                    className={cn(
                      "absolute overflow-hidden rounded-sm border border-background px-1.5 py-1 text-left text-xs outline-none focus-visible:z-20 focus-visible:ring-2 focus-visible:ring-ring",
                      CALENDAR_ENTRY_COLOR_CLASS[color],
                    )}
                    data-planner-range-end={item.entry.end}
                    data-planner-range-start={item.entry.start}
                    data-planner-schedule-entry={item.id}
                    style={{
                      top: (start / 60) * 48,
                      height: Math.max(18, ((end - start) / 60) * 48),
                      left: `${(column / columns) * 100}%`,
                      width: `${100 / columns}%`,
                    }}
                    type="button"
                    onClick={(event) => onOpen(item, event.currentTarget)}
                  >
                    <span className="block truncate font-medium">{name(item)}</span>

                    <span className="block truncate opacity-80">
                      {format.date(new Date(item.entry.time ?? ""), {
                        hour: "numeric",
                        minute: "2-digit",
                        timeZone: config.timeZone,
                      })}
                    </span>
                  </button>
                </CalendarEntryTooltip>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
