"use client";

import type { ReactElement } from "react";
import type { CalendarEntry } from "@/features/record-calendar/calendar-entries";

import { useRecordValueFormat } from "@/components/records/record-value";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { calendarDateInstant } from "@/features/record-calendar/calendar-date";
import { zonedDate } from "@/features/record-calendar/zoned-time";

export function useCalendarEntryDateLabel(timeZone: string | undefined, compact = false) {
  const format = useRecordValueFormat();
  const zone = timeZone ?? "UTC";
  const dateOptions: Intl.DateTimeFormatOptions = compact
    ? { weekday: "short", day: "numeric", month: "short" }
    : { dateStyle: "full" };
  return (entry: Pick<CalendarEntry, "start" | "end" | "time" | "endTime">) => {
    const day = (date: string) => format.date(calendarDateInstant(date), { ...dateOptions, timeZone: "UTC" });
    if (!entry.time) return entry.start === entry.end ? day(entry.start) : `${day(entry.start)} – ${day(entry.end)}`;
    const instant = (value: string) =>
      format.date(
        new Date(value),
        compact
          ? { ...dateOptions, hour: "numeric", minute: "2-digit", timeZone: zone }
          : { dateStyle: "full", timeStyle: "short", timeZone: zone },
      );
    const first = instant(entry.time);
    if (!entry.endTime || entry.endTime === entry.time) return first;
    const sameDay = zonedDate(entry.endTime, zone) === zonedDate(entry.time, zone);
    const last = sameDay
      ? format.date(new Date(entry.endTime), { timeStyle: "short", timeZone: zone })
      : instant(entry.endTime);
    return `${first} – ${last}`;
  };
}

export function CalendarEntryTooltip({
  children,
  name,
  date,
  source,
}: {
  children: ReactElement;
  name: string;
  date: string;
  source?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>

      <TooltipContent className="max-w-xs space-y-1 wrap-anywhere">
        <span className="block font-medium">{name}</span>

        <span className="block">{date}</span>

        {source && <span className="block text-muted-foreground">{source}</span>}
      </TooltipContent>
    </Tooltip>
  );
}
