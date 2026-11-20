import { describe, expect, it, vi } from "vitest";

import type { PersonalCalendarEvent } from "@/features/planner/planner.repo";

import { BusyTimeReader } from "../busy-time.reader";
import { computeFreeSlots } from "../free-slots";
import { DEFAULT_WORKING_HOURS } from "../working-hours";

function event(overrides: Partial<PersonalCalendarEvent>): PersonalCalendarEvent {
  return {
    id: "event",
    calendarId: "calendar",
    calendarName: "Work",
    title: "Entry",
    startsAt: "2026-11-17T09:00:00.000Z",
    endsAt: "2026-11-17T10:00:00.000Z",
    allDay: false,
    location: null,
    recurrenceRule: null,
    provider: "google",
    timezone: null,
    transparency: null,
    ...overrides,
  };
}

function allDay(overrides: Partial<PersonalCalendarEvent>): PersonalCalendarEvent {
  return event({
    startsAt: "2026-11-17T00:00:00.000Z",
    endsAt: "2026-11-18T00:00:00.000Z",
    allDay: true,
    ...overrides,
  });
}

function reader(events: PersonalCalendarEvent[]) {
  const personal = {
    calendars: vi.fn().mockResolvedValue([{ id: "calendar", name: "Work", provider: "google" }]),
    events: vi.fn().mockResolvedValue({ events, truncated: false }),
  };
  return { personal, subject: new BusyTimeReader(personal) };
}

const FROM = new Date("2026-11-17T00:00:00.000Z");
const TO = new Date("2026-11-18T00:00:00.000Z");

async function busy(events: PersonalCalendarEvent[], timeZone = "Europe/Berlin") {
  const intervals = await reader(events).subject.read(FROM, TO, timeZone);
  return intervals.map((interval) => [interval.startsAt.toISOString(), interval.endsAt.toISOString()]);
}

describe("BusyTimeReader", () => {
  it("blocks the whole day of an all-day entry the provider marks busy, in the time zone of the entry", async () => {
    expect(await busy([allDay({ transparency: "opaque", timezone: "Europe/Berlin" })], "America/New_York")).toEqual([
      ["2026-11-16T23:00:00.000Z", "2026-11-17T23:00:00.000Z"],
    ]);
  });

  it("blocks every day of a busy all-day entry that spans several days", async () => {
    expect(
      await busy([allDay({ transparency: "opaque", timezone: "Europe/Berlin", endsAt: "2026-11-20T00:00:00.000Z" })]),
    ).toEqual([["2026-11-16T23:00:00.000Z", "2026-11-19T23:00:00.000Z"]]);
  });

  it("falls back to the time zone of the booking page when the entry has none or an unknown one", async () => {
    const expected = [["2026-11-17T05:00:00.000Z", "2026-11-18T05:00:00.000Z"]];

    expect(await busy([allDay({ transparency: "opaque" })], "America/New_York")).toEqual(expected);
    expect(
      await busy([allDay({ transparency: "opaque", timezone: "W. Europe Standard Time" })], "America/New_York"),
    ).toEqual(expected);
  });

  it("does not block for an all-day entry the provider marks free", async () => {
    expect(await busy([allDay({ transparency: "transparent", timezone: "Europe/Berlin" })])).toEqual([]);
  });

  it("does not block for a timed entry the provider marks free", async () => {
    expect(await busy([event({ transparency: "transparent" })])).toEqual([]);
    expect(await busy([event({ transparency: " Transparent " })])).toEqual([]);
  });

  it("blocks for a timed entry the provider marks busy", async () => {
    expect(await busy([event({ transparency: "opaque" })])).toEqual([
      ["2026-11-17T09:00:00.000Z", "2026-11-17T10:00:00.000Z"],
    ]);
  });

  it("treats entries synced without the mark as before: a timed one blocks, an all-day one does not", async () => {
    expect(await busy([event({ transparency: null }), allDay({ transparency: null })])).toEqual([
      ["2026-11-17T09:00:00.000Z", "2026-11-17T10:00:00.000Z"],
    ]);
    expect(await busy([event({ transparency: undefined }), allDay({ transparency: undefined })])).toHaveLength(1);
  });

  it("ends the block of a busy all-day entry at midnight of its own zone, also across a clock change", async () => {
    expect(
      await busy([
        allDay({
          transparency: "opaque",
          timezone: "Europe/Berlin",
          startsAt: "2026-10-25T00:00:00.000Z",
          endsAt: "2026-10-26T00:00:00.000Z",
        }),
      ]),
    ).toEqual([["2026-10-24T22:00:00.000Z", "2026-10-25T23:00:00.000Z"]]);
  });

  it("hides the slots that a busy all-day entry of a zone further east covers on the day before", async () => {
    const tokyo = allDay({ transparency: "opaque", timezone: "Asia/Tokyo" });
    const { subject } = reader([tokyo]);
    const blocked = await subject.read(FROM, TO, "America/Los_Angeles");

    expect(blocked.map((interval) => interval.startsAt.toISOString())).toEqual(["2026-11-16T15:00:00.000Z"]);

    const slots = computeFreeSlots({
      rules: {
        workingHours: DEFAULT_WORKING_HOURS,
        timeZone: "America/Los_Angeles",
        durationMinutes: 30,
        bufferMinutes: 0,
        minNoticeMinutes: 0,
        horizonDays: 14,
        stepMinutes: 30,
      },
      now: new Date("2026-11-16T00:00:00.000Z"),
      busy: blocked,
      to: new Date("2026-11-18T08:00:00.000Z"),
      limit: 1000,
    }).map((slot) => slot.startsAt);

    expect(slots.filter((slot) => slot < "2026-11-17T15:00:00.000Z")).toEqual([]);
    expect(slots[0]).toBe("2026-11-17T17:00:00.000Z");
  });

  it("reads one more day on each side so an all-day entry of another zone is not missed at the day border", async () => {
    const { personal, subject } = reader([]);

    await subject.read(new Date("2026-11-17T12:00:00.000Z"), new Date("2026-11-18T12:00:00.000Z"), "Europe/Berlin");

    expect(personal.events).toHaveBeenCalledWith(["calendar"], {
      from: "2026-11-16",
      to: "2026-11-19",
      timeZone: "Europe/Berlin",
    });
  });

  it("counts an entry the app created as busy even when the provider marks it free", async () => {
    expect(await busy([Object.assign(event({ transparency: "transparent" }), { createdByApp: true })])).toEqual([
      ["2026-11-17T09:00:00.000Z", "2026-11-17T10:00:00.000Z"],
    ]);
  });

  it("blocks the whole range it was asked for when the calendar could not be read in full", async () => {
    const personal = {
      calendars: vi.fn().mockResolvedValue([{ id: "calendar", name: "Work", provider: "google" }]),
      events: vi.fn().mockResolvedValue({ events: [event({ transparency: "opaque" })], truncated: true }),
    };
    const subject = new BusyTimeReader(personal);

    expect(await subject.window(FROM, TO, "Europe/Berlin")).toMatchObject({ truncated: true });

    const blocked = await subject.read(FROM, TO, "Europe/Berlin");
    const slots = computeFreeSlots({
      rules: {
        workingHours: DEFAULT_WORKING_HOURS,
        timeZone: "Europe/Berlin",
        durationMinutes: 30,
        bufferMinutes: 0,
        minNoticeMinutes: 0,
        horizonDays: 14,
        stepMinutes: 30,
      },
      now: new Date("2026-11-16T00:00:00.000Z"),
      busy: blocked,
      from: FROM,
      to: TO,
      limit: 1000,
    });

    expect(blocked).toHaveLength(2);
    expect(slots).toEqual([]);
  });

  it("reads nothing without a connected calendar", async () => {
    const personal = { calendars: vi.fn().mockResolvedValue([]), events: vi.fn() };

    expect(await new BusyTimeReader(personal).read(FROM, TO, "Europe/Berlin")).toEqual([]);
    expect(personal.events).not.toHaveBeenCalled();
  });
});
