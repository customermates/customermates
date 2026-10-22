import { describe, expect, it } from "vitest";

import type { PersonalCalendarEvent } from "../planner.repo";

import { plannerEntries } from "../planner-entries";
import { layoutPlannerDay } from "../planner-week-layout";

function entries(event: Partial<PersonalCalendarEvent>, timeZone = "Europe/Berlin") {
  return plannerEntries(
    {
      sources: [],
      events: [
        {
          id: "event",
          calendarId: "calendar",
          title: "A long planning event",
          startsAt: "2026-10-30T23:00:00Z",
          endsAt: "2026-11-02T23:00:00Z",
          allDay: false,
          location: null,
          recurrenceRule: null,
          provider: "google",
          ...event,
        },
      ],
      personalTruncated: false,
    },
    timeZone,
  );
}

describe("planner date ranges", () => {
  it("includes all-day events through their last day across a month and week boundary", () => {
    const result = entries({ startsAt: "2026-10-30T00:00:00Z", endsAt: "2026-11-03T00:00:00Z", allDay: true });
    expect(result[0].entry).toMatchObject({ start: "2026-10-30", end: "2026-11-02", time: null });
    expect(layoutPlannerDay(result, "2026-11-01", "Europe/Berlin")).toEqual([]);
  });

  it("ends a midnight event on the preceding day, including full intermediate days", () => {
    const result = entries({});
    expect(result[0].entry).toMatchObject({ start: "2026-10-31", end: "2026-11-02" });
    expect(layoutPlannerDay(result, "2026-11-01", "Europe/Berlin")).toMatchObject([{ start: 0, end: 1440 }]);
    expect(layoutPlannerDay(result, "2026-11-02", "Europe/Berlin")).toMatchObject([{ start: 0, end: 1440 }]);
    expect(layoutPlannerDay(result, "2026-11-03", "Europe/Berlin")).toEqual([]);
  });

  it("clips a timed overnight event to the correct hours on both days", () => {
    const result = entries({ startsAt: "2026-10-31T21:30:00Z", endsAt: "2026-11-01T01:15:00Z" });
    expect(layoutPlannerDay(result, "2026-10-31", "Europe/Berlin")).toMatchObject([{ start: 22 * 60 + 30, end: 1440 }]);
    expect(layoutPlannerDay(result, "2026-11-01", "Europe/Berlin")).toMatchObject([{ start: 0, end: 2 * 60 + 15 }]);
  });

  it("keeps overlapping events in separate columns and reuses the space after they end", () => {
    const first = entries({ startsAt: "2026-10-25T07:30:00Z", endsAt: "2026-10-25T08:30:00Z" });
    const second = entries({ id: "other", startsAt: "2026-10-25T08:00:00Z", endsAt: "2026-10-25T09:00:00Z" });
    const later = entries({ id: "later", startsAt: "2026-10-25T09:00:00Z", endsAt: "2026-10-25T10:00:00Z" });
    expect(layoutPlannerDay([...first, ...second, ...later], "2026-10-25", "Europe/Berlin")).toMatchObject([
      { start: 510, end: 570, column: 0, columns: 2 },
      { start: 540, end: 600, column: 1, columns: 2 },
      { start: 600, end: 660, column: 0, columns: 1 },
    ]);
  });
});
