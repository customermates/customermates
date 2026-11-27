import { describe, expect, it } from "vitest";

import { buildCalendarEvent } from "../calendar-normalize";

function rawEvent(title: string | null | undefined, extra: Record<string, unknown> = {}) {
  return {
    id: "calendar-event-1",
    title,
    start: { type: "date_time", date_time: "2026-08-10T09:00:00.000Z", timezone: "UTC" },
    end: { type: "date_time", date_time: "2026-08-10T10:00:00.000Z", timezone: "UTC" },
    ...extra,
  } as never;
}

describe("buildCalendarEvent", () => {
  it.each([undefined, null, "", "   "])("stores a blank semantic title for %s", (title) => {
    expect(buildCalendarEvent(rawEvent(title))?.title).toBe("");
  });

  it("stores an occurrence with its series id and without the series rule", () => {
    const occurrence = buildCalendarEvent(
      rawEvent("Weekly sync", { master_event_id: "series-1", recurrence: ["RRULE:FREQ=WEEKLY"] }),
    );
    const series = buildCalendarEvent(rawEvent("Weekly sync", { recurrence: ["RRULE:FREQ=WEEKLY"] }));
    const empty = buildCalendarEvent(rawEvent("Call", { master_event_id: "" }));

    expect(occurrence).toMatchObject({ masterUnipileEventId: "series-1", recurrenceRule: null });
    expect(series).toMatchObject({ masterUnipileEventId: null, recurrenceRule: "RRULE:FREQ=WEEKLY" });
    expect(empty?.masterUnipileEventId).toBeNull();
  });

  it("trims a provider-supplied title", () => {
    expect(buildCalendarEvent(rawEvent("  Quarterly review  "))?.title).toBe("Quarterly review");
  });

  it.each([
    ["opaque", "opaque"],
    ["transparent", "transparent"],
    [" Transparent ", "transparent"],
    ["", null],
    [null, null],
    [undefined, null],
  ])("keeps the free or busy mark %s of the provider as %s", (transparency, stored) => {
    expect(buildCalendarEvent(rawEvent("Review", { transparency }))?.transparency).toBe(stored);
  });

  it("keeps the mark of an all-day entry", () => {
    const event = buildCalendarEvent(
      rawEvent("Trade fair", {
        is_all_day: true,
        start: { type: "date", date: "2026-08-10" },
        end: { type: "date", date: "2026-08-12" },
        transparency: "opaque",
      }),
    );

    expect(event).toMatchObject({
      allDay: true,
      transparency: "opaque",
      startsAt: new Date("2026-08-10T00:00:00.000Z"),
      endsAt: new Date("2026-08-12T00:00:00.000Z"),
    });
  });
});
