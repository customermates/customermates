"use client";

import type { ChipColor } from "@/constants/chip-colors";
import type { PlannerEntry } from "@/features/planner/planner-entries";
import type { PlannerConfig } from "@/features/planner/planner.schema";
import type { CalendarWindow } from "@/core/data-view/calendar-view-config.schema";

import { useTranslations } from "next-intl";
import { useRecordValueFormat } from "@/components/records/record-value";
import { CalendarEntryTooltip, useCalendarEntryDateLabel } from "@/components/records/calendar-entry-tooltip";
import { cn } from "@/core/utils/cn";
import {
  calendarDateInstant,
  calendarDatesBetween,
  calendarDayDifference,
} from "@/features/record-calendar/calendar-date";
import { calendarEntryColorStyle } from "../../records/[typeId]/components/record-calendar-layout";

export function PlannerTimeline({
  entries,
  config,
  window,
  refreshing,
  name,
  color,
  onOpen,
}: {
  entries: PlannerEntry[];
  config: PlannerConfig;
  window: CalendarWindow;
  refreshing: boolean;
  name: (item: PlannerEntry) => string;
  color: (item: PlannerEntry) => ChipColor;
  onOpen: (item: PlannerEntry, opener: HTMLElement) => void;
}) {
  const t = useTranslations();
  const format = useRecordValueFormat();
  const dateLabel = useCalendarEntryDateLabel(config.timeZone);
  const days = calendarDatesBetween(window.from, window.to);
  const width = days.length * 28;
  return (
    <div
      aria-label={t("Planner.modes.timeline")}
      className={cn("min-h-0 flex-1 overflow-auto", refreshing && "opacity-70")}
      data-planner-timeline=""
      role="region"
    >
      <div style={{ minWidth: width + 240 }}>
        <div className="sticky top-0 z-20 flex border-b bg-background">
          <div className="sticky left-0 z-30 w-60 shrink-0 border-r bg-background p-3 text-xs font-medium">
            {t("RecordModel.records")}
          </div>

          <div className="flex" style={{ width }}>
            {days.map((day, index) => (
              <div
                key={day}
                aria-label={format.date(calendarDateInstant(day), { dateStyle: "full", timeZone: "UTC" })}
                className="w-7 shrink-0 border-r py-1 text-center text-[10px] tabular-nums text-muted-foreground"
              >
                <span aria-hidden className="block h-4 whitespace-nowrap text-left font-medium">
                  {index === 0 || day.endsWith("-01")
                    ? format.date(calendarDateInstant(day), { month: "short", timeZone: "UTC" })
                    : ""}
                </span>

                <span aria-hidden>{format.date(calendarDateInstant(day), { day: "numeric", timeZone: "UTC" })}</span>
              </div>
            ))}
          </div>
        </div>

        {entries
          .filter((item) => item.entry.start <= window.to && item.entry.end >= window.from)
          .map((item) => {
            const start = item.entry.start < window.from ? window.from : item.entry.start;
            const end = item.entry.end > window.to ? window.to : item.entry.end;
            const left = calendarDayDifference(window.from, start) * 28;
            const span = (calendarDayDifference(start, end) + 1) * 28;
            return (
              <div key={item.id} className="flex min-h-12 border-b" data-planner-timeline-row={item.id}>
                <CalendarEntryTooltip date={dateLabel(item.entry)} name={name(item)} source={item.sourceLabel}>
                  <button
                    className="sticky left-0 z-10 flex w-60 shrink-0 flex-col justify-center border-r bg-background px-3 py-2 text-left outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                    type="button"
                    onClick={(event) => onOpen(item, event.currentTarget)}
                  >
                    <span className="w-full truncate text-sm font-medium">{name(item)}</span>

                    <span className="w-full truncate text-xs text-muted-foreground">{item.sourceLabel}</span>
                  </button>
                </CalendarEntryTooltip>

                <div
                  className="relative flex-1"
                  style={{
                    width,
                    backgroundImage: "linear-gradient(to right, var(--border) 1px, transparent 1px)",
                    backgroundSize: "28px 100%",
                  }}
                >
                  <CalendarEntryTooltip date={dateLabel(item.entry)} name={name(item)} source={item.sourceLabel}>
                    <button
                      aria-label={`${name(item)} · ${dateLabel(item.entry)}`}
                      className={cn(
                        "absolute top-3 h-6 truncate rounded-sm px-2 text-left text-xs font-medium outline-none hover:brightness-95 focus-visible:ring-2 focus-visible:ring-ring",
                        item.entry.start < start && "rounded-l-none",
                        item.entry.end > end && "rounded-r-none",
                      )}
                      data-planner-continues-after={item.entry.end > end || undefined}
                      data-planner-continues-before={item.entry.start < start || undefined}
                      data-planner-range-end={end}
                      data-planner-range-start={start}
                      style={{ ...calendarEntryColorStyle(color(item)), left: left + 2, width: Math.max(24, span - 4) }}
                      tabIndex={-1}
                      type="button"
                      onClick={(event) => onOpen(item, event.currentTarget)}
                    >
                      {name(item)}
                    </button>
                  </CalendarEntryTooltip>
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}
