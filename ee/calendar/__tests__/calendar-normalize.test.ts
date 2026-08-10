import { describe, expect, it } from "vitest";

import { buildCalendarEvent } from "../calendar-normalize";

function rawEvent(title: string | null | undefined) {
  return {
    id: "calendar-event-1",
    title,
    start: { type: "date_time", date_time: "2026-08-10T09:00:00.000Z", timezone: "UTC" },
    end: { type: "date_time", date_time: "2026-08-10T10:00:00.000Z", timezone: "UTC" },
  } as never;
}

describe("buildCalendarEvent", () => {
  it.each([undefined, null, "", "   "])("stores a blank semantic title for %s", (title) => {
    expect(buildCalendarEvent(rawEvent(title))?.title).toBe("");
  });

  it("trims a provider-supplied title", () => {
    expect(buildCalendarEvent(rawEvent("  Quarterly review  "))?.title).toBe("Quarterly review");
  });
});
