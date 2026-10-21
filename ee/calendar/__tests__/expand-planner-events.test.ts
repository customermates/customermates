import { describe, expect, it } from "vitest";

import { expandPlannerEvents, type RecurringPlannerEvent } from "../expand-planner-events";

const event: RecurringPlannerEvent = {
  id: "series",
  calendarId: "calendar",
  title: "Weekly review",
  startsAt: "2026-03-22T08:00:00Z",
  endsAt: "2026-03-22T09:00:00Z",
  timezone: "Europe/Berlin",
  allDay: false,
  location: null,
  provider: "GOOGLE",
  recurrenceRule: "RRULE:FREQ=WEEKLY;COUNT=4\nEXDATE;TZID=Europe/Berlin:20260405T090000",
};
describe("connected recurring calendar events", () => {
  it("keeps local meeting time across DST and honors exclusions", () => {
    const result = expandPlannerEvents([event], { from: "2026-03-01", to: "2026-04-30", timeZone: "Europe/Berlin" });
    expect(result.truncated).toBe(false);
    expect(result.events.map((item) => item.startsAt)).toEqual([
      "2026-03-22T08:00:00.000Z",
      "2026-03-29T07:00:00.000Z",
      "2026-04-12T07:00:00.000Z",
    ]);
    expect(
      result.events.every((item) => new Date(item.endsAt).getTime() - new Date(item.startsAt).getTime() === 3_600_000),
    ).toBe(true);
  });
  it("finds occurrences when the series starts before the requested window", () => {
    const result = expandPlannerEvents([event], { from: "2026-04-01", to: "2026-04-30", timeZone: "America/New_York" });
    expect(result.events.map((item) => item.startsAt)).toEqual(["2026-04-12T07:00:00.000Z"]);
  });
  it("bounds expansion and marks unsupported or invalid rules incomplete", () => {
    const daily = { ...event, recurrenceRule: "RRULE:FREQ=DAILY" };
    expect(expandPlannerEvents([daily], { from: "2026-03-01", to: "2026-04-30", timeZone: "UTC" }, 3)).toMatchObject({
      events: expect.any(Array),
      truncated: true,
    });
    expect(
      expandPlannerEvents([{ ...event, recurrenceRule: "RRULE:FREQ=SECONDLY" }], {
        from: "2026-03-01",
        to: "2026-04-30",
        timeZone: "UTC",
      }),
    ).toEqual({ events: [], truncated: true });
  });
  it("keeps all-day dates in the requested window even in UTC+14", () => {
    const result = expandPlannerEvents(
      [
        {
          ...event,
          allDay: true,
          startsAt: "2026-03-22T00:00:00Z",
          endsAt: "2026-03-23T00:00:00Z",
          recurrenceRule: "RRULE:FREQ=WEEKLY;COUNT=4",
        },
      ],
      { from: "2026-03-29", to: "2026-03-29", timeZone: "Pacific/Kiritimati" },
    );
    expect(result.events.map((item) => item.startsAt.slice(0, 10))).toEqual(["2026-03-29"]);
  });
});
