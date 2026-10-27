import { describe, expect, it } from "vitest";

import type { PlannerEntry } from "../planner-entries";
import { foldCalendarLine, plannerICalendar } from "../planner-ical";

function entry(overrides: Partial<PlannerEntry> = {}): PlannerEntry {
  return {
    id: "source:record",
    sourceId: "source",
    sourceLabel: "Projects",
    title: { state: "value", value: { kind: "text", value: "Launch, phase; one\nNext line" } },
    record: null,
    entry: { id: "record", start: "2026-03-28", end: "2026-03-30", time: null, color: null },
    location: "Berlin; HQ",
    provider: null,
    ...overrides,
  };
}

const recordUrl = (typeId: string, recordId: string) => `https://example.test/w/acme/records/${typeId}/${recordId}`;

describe("iCalendar interoperability", () => {
  it("exports inclusive CRM date ranges as exclusive date-only DTEND with stable UIDs and escaped text", () => {
    const value = plannerICalendar([entry()], recordUrl, new Date("2026-03-27T08:15:30.000Z"));
    expect(value).toContain("UID:source:record@customermates\r\n");
    expect(value).toContain("DTSTAMP:20260327T081530Z\r\n");
    expect(value).toContain("DTSTART;VALUE=DATE:20260328\r\nDTEND;VALUE=DATE:20260331\r\n");
    expect(value).toContain("SUMMARY:Launch\\, phase\\; one\\nNext line\r\n");
    expect(value).toContain("LOCATION:Berlin\\; HQ\r\n");
    expect(value.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(value.replace(/\r\n/gu, "")).not.toMatch(/[\r\n]/u);
  });
  it("exports instants in UTC across DST without turning them into date-only events", () => {
    const value = plannerICalendar(
      [
        entry({
          entry: {
            id: "timed",
            start: "2026-03-29",
            end: "2026-03-29",
            time: "2026-03-29T09:00:00+02:00",
            endTime: "2026-03-29T11:30:00+02:00",
            color: null,
          },
        }),
      ],
      recordUrl,
      new Date("2026-03-27T08:15:30.000Z"),
    );
    expect(value).toContain("DTSTART:20260329T070000Z\r\nDTEND:20260329T093000Z\r\n");
  });
  it("folds UTF-8 at 75 octets and unfolds losslessly, including four-byte characters", () => {
    const line = `SUMMARY:${"Äpfel 🗓️ ".repeat(35)}`;
    const folded = foldCalendarLine(line);
    for (const part of folded.split("\r\n")) expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75);
    expect(folded.replace(/\r\n /gu, "")).toBe(line);
  });
});
