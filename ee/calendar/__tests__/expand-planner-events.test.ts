import { describe, expect, it } from "vitest";

import { expandPlannerEvents, type RecurringPlannerEvent } from "../expand-planner-events";

const event: RecurringPlannerEvent = {
  id: "series",
  calendarId: "calendar",
  calendarName: "Team calendar",
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
  it("reads exclusions and an end given in UTC in the series' own time zone", () => {
    const result = expandPlannerEvents(
      [
        {
          ...event,
          recurrenceRule: "RRULE:FREQ=WEEKLY;UNTIL=20260412T070000Z\nEXDATE:20260405T070000Z",
        },
      ],
      { from: "2026-03-01", to: "2026-04-30", timeZone: "Europe/Berlin" },
    );
    expect(result.events.map((item) => item.startsAt)).toEqual([
      "2026-03-22T08:00:00.000Z",
      "2026-03-29T07:00:00.000Z",
      "2026-04-12T07:00:00.000Z",
    ]);
  });
  it("reads a start or exclusion declared in another time zone in that zone", () => {
    const window = { from: "2026-03-01", to: "2026-04-30", timeZone: "Europe/Berlin" };
    const excluded = expandPlannerEvents(
      [{ ...event, recurrenceRule: "RRULE:FREQ=WEEKLY;COUNT=4\nEXDATE;TZID=America/New_York:20260405T030000" }],
      window,
    );
    expect(excluded.events.map((item) => item.startsAt)).toEqual([
      "2026-03-22T08:00:00.000Z",
      "2026-03-29T07:00:00.000Z",
      "2026-04-12T07:00:00.000Z",
    ]);
    const declared = expandPlannerEvents(
      [{ ...event, recurrenceRule: "DTSTART;TZID=America/New_York:20260322T040000\nRRULE:FREQ=WEEKLY;COUNT=2" }],
      window,
    );
    expect(declared.events.map((item) => item.startsAt)).toEqual([
      "2026-03-22T08:00:00.000Z",
      "2026-03-29T08:00:00.000Z",
    ]);
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
