"use client";

import type { PlannerEntry } from "@/features/planner/planner-entries";
import type { PlannerConfig } from "@/features/planner/planner.schema";
import type { CalendarWindow } from "@/core/data-view/calendar-view-config.schema";

import { useTranslations } from "next-intl";
import { useRecordValueFormat } from "@/components/records/record-value";
import { cn } from "@/core/utils/cn";
import { calendarDatesBetween, calendarDayDifference } from "@/features/record-calendar/calendar-date";
import { CALENDAR_ENTRY_COLOR_CLASS } from "../../records/[typeId]/components/record-calendar-layout";

export function PlannerTimeline({
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
  const t = useTranslations();
  const format = useRecordValueFormat();
  const days = calendarDatesBetween(window.from, window.to);
  const width = days.length * 28;
  return (
    <div
      aria-label={t("Planner.modes.timeline")}
      className="min-h-0 flex-1 overflow-auto"
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
                aria-label={day}
                className="w-7 shrink-0 border-r py-1 text-center text-[10px] tabular-nums text-muted-foreground"
              >
                <span className="block h-4 whitespace-nowrap text-left font-medium">
                  {index === 0 || day.endsWith("-01")
                    ? format.date(new Date(`${day}T00:00:00Z`), { month: "short", timeZone: "UTC" })
                    : ""}
                </span>

                {Number(day.slice(8))}
              </div>
            ))}
          </div>
        </div>

        {entries.map((item) => {
          const start = item.entry.start < window.from ? window.from : item.entry.start;
          const end = item.entry.end > window.to ? window.to : item.entry.end;
          const left = calendarDayDifference(window.from, start) * 28;
          const span = (calendarDayDifference(start, end) + 1) * 28;
          const color = config.sources.find((source) => source.id === item.sourceId)?.color ?? "secondary";
          return (
            <div key={item.id} className="flex min-h-12 border-b" data-planner-timeline-row={item.id}>
              <button
                className="sticky left-0 z-10 flex w-60 shrink-0 flex-col justify-center border-r bg-background px-3 py-2 text-left outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                type="button"
                onClick={(event) => onOpen(item, event.currentTarget)}
              >
                <span className="w-full truncate text-sm font-medium">{name(item)}</span>

                <span className="w-full truncate text-xs text-muted-foreground">{item.sourceLabel}</span>
              </button>

              <div
                className="relative flex-1"
                style={{
                  width,
                  backgroundImage: "linear-gradient(to right, var(--border) 1px, transparent 1px)",
                  backgroundSize: "28px 100%",
                }}
              >
                <button
                  aria-label={`${name(item)} · ${item.entry.start} – ${item.entry.end}`}
                  className={cn(
                    "absolute top-3 h-6 truncate rounded-sm px-2 text-left text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    CALENDAR_ENTRY_COLOR_CLASS[color],
                  )}
                  style={{ left: left + 2, width: Math.max(24, span - 4) }}
                  type="button"
                  onClick={(event) => onOpen(item, event.currentTarget)}
                >
                  {name(item)}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
