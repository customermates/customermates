import type { PlannerEntry } from "./planner-entries";

import { addCalendarDays } from "@/features/record-calendar/calendar-date";

function escapeText(value: string): string {
  return value
    .replace(/\\/gu, "\\\\")
    .replace(/\r\n|\r|\n/gu, "\\n")
    .replace(/;/gu, "\\;")
    .replace(/,/gu, "\\,");
}

export function foldCalendarLine(line: string): string {
  let width = 0;
  let folded = "";
  for (const char of line) {
    const bytes = new TextEncoder().encode(char).length;
    if (width + bytes > 75) {
      folded += "\r\n ";
      width = 1;
    }
    folded += char;
    width += bytes;
  }
  return folded;
}

function instant(value: string): string {
  return new Date(value)
    .toISOString()
    .replace(/[-:]/gu, "")
    .replace(/\.\d{3}/u, "");
}
function title(entry: PlannerEntry): string {
  return entry.title.state === "value" && entry.title.value.kind === "text"
    ? entry.title.value.value
    : entry.sourceLabel;
}

export function plannerICalendar(entries: PlannerEntry[], baseUrl: string, stamp: Date): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Customermates//Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Customermates",
  ];
  for (const item of entries) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${item.id}@customermates`,
      `DTSTAMP:${instant(stamp.toISOString())}`,
      `SUMMARY:${escapeText(title(item))}`,
      `DESCRIPTION:${escapeText(item.sourceLabel)}`,
    );
    if (item.entry.time) {
      const end =
        item.entry.endTime && new Date(item.entry.endTime) > new Date(item.entry.time)
          ? item.entry.endTime
          : new Date(new Date(item.entry.time).getTime() + 3_600_000).toISOString();
      lines.push(`DTSTART:${instant(item.entry.time)}`, `DTEND:${instant(end)}`);
    } else {
      lines.push(
        `DTSTART;VALUE=DATE:${item.entry.start.replace(/-/gu, "")}`,
        `DTEND;VALUE=DATE:${addCalendarDays(item.entry.end, 1).replace(/-/gu, "")}`,
      );
    }

    if (item.record)
      lines.push(`URL:${baseUrl.replace(/\/$/u, "")}/records/${item.record.ref.typeId}/${item.record.ref.recordId}`);
    if (item.location) lines.push(`LOCATION:${escapeText(item.location)}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return `${lines.map(foldCalendarLine).join("\r\n")}\r\n`;
}
