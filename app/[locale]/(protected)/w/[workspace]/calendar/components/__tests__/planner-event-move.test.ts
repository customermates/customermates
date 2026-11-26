import { describe, expect, it, vi } from "vitest";

import type { PersonalCalendarEvent } from "@/features/planner/planner.repo";

import { ConnectedAccountStatus, MessagingProvider } from "@/generated/prisma";
import { plannerEventEditable } from "@/ee/calendar/own-calendar-account";
import { plannerEntries } from "@/features/planner/planner-entries";

import { eventMove, plannerCalendarAdapter } from "../planner-calendar-adapter";

const TIME_ZONE = "Europe/Berlin";
const WINDOW = { from: "2026-11-23", to: "2026-11-29", timeZone: TIME_ZONE };

function event(overrides: Partial<PersonalCalendarEvent> = {}): PersonalCalendarEvent {
  return {
    id: "f028e950-af9d-4389-a72c-f497a0d79d8d",
    calendarId: "calendar",
    calendarName: "Work",
    title: "Onboarding call",
    startsAt: "2026-11-26T13:00:00.000Z",
    endsAt: "2026-11-26T13:45:00.000Z",
    allDay: false,
    location: null,
    recurrenceRule: null,
    provider: "google",
    editable: true,
    ...overrides,
  };
}

function entryOf(overrides: Partial<PersonalCalendarEvent> = {}) {
  const [entry] = plannerEntries({ sources: [], events: [event(overrides)], personalTruncated: false }, TIME_ZONE);
  return entry;
}

function adapter(
  entries: ReturnType<typeof entryOf>[],
  moveEvent: Parameters<typeof plannerCalendarAdapter>[0]["moveEvent"],
) {
  return plannerCalendarAdapter({
    stores: new Map(),
    colors: () => "secondary",
    entries,
    anchor: "2026-11-26",
    mode: "week",
    window: WINDOW,
    refreshing: false,
    refresh: () => Promise.resolve(),
    navigate: () => undefined,
    create: null,
    moveEvent,
  });
}

describe("plannerEventEditable", () => {
  const own = { userId: "me", status: ConnectedAccountStatus.ok, provider: MessagingProvider.google };
  const timed = { allDay: false, recurrenceRule: null };

  it("allows timed single events in the viewer's own working Google or Outlook calendar", () => {
    expect(plannerEventEditable(timed, own, "me")).toBe(true);
    expect(plannerEventEditable(timed, { ...own, provider: MessagingProvider.outlook }, "me")).toBe(true);
  });

  it("keeps shared calendars, broken connections, all-day events and recurring series read-only", () => {
    expect(plannerEventEditable(timed, own, "someone-else")).toBe(false);
    expect(plannerEventEditable(timed, { ...own, status: ConnectedAccountStatus.credentials }, "me")).toBe(false);
    expect(plannerEventEditable({ ...timed, allDay: true }, own, "me")).toBe(false);
    expect(plannerEventEditable({ ...timed, recurrenceRule: "RRULE:FREQ=WEEKLY" }, own, "me")).toBe(false);
  });
});

describe("planner entries of connected events", () => {
  it("carry the event id and whether the viewer may move them", () => {
    expect(entryOf()).toMatchObject({ eventId: "f028e950-af9d-4389-a72c-f497a0d79d8d", editable: true, record: null });
    expect(entryOf({ editable: false }).editable).toBe(false);
    expect(entryOf({ editable: undefined }).editable).toBe(false);
    expect(
      entryOf({ allDay: true, startsAt: "2026-11-26T00:00:00.000Z", endsAt: "2026-11-27T00:00:00.000Z" }).editable,
    ).toBe(false);
  });
});

describe("eventMove", () => {
  it("moves start and end together by days and minutes, keeping the length", () => {
    expect(eventMove(entryOf(), { edge: "move", days: 1, minutes: 60 }, TIME_ZONE)).toEqual({
      entryId: "event:f028e950-af9d-4389-a72c-f497a0d79d8d",
      eventId: "f028e950-af9d-4389-a72c-f497a0d79d8d",
      startsAt: "2026-11-27T14:00:00.000Z",
      endsAt: "2026-11-27T14:45:00.000Z",
      previous: { startsAt: "2026-11-26T13:00:00.000Z", endsAt: "2026-11-26T13:45:00.000Z" },
    });
  });

  it("changes only the end when the bottom edge is dragged, and never below 15 minutes", () => {
    expect(eventMove(entryOf(), { edge: "end", days: 0, minutes: 30 }, TIME_ZONE)).toMatchObject({
      startsAt: "2026-11-26T13:00:00.000Z",
      endsAt: "2026-11-26T14:15:00.000Z",
    });
    expect(eventMove(entryOf(), { edge: "end", days: 0, minutes: -60 }, TIME_ZONE)).toMatchObject({
      startsAt: "2026-11-26T13:00:00.000Z",
      endsAt: "2026-11-26T13:15:00.000Z",
    });
  });

  it("changes only the start when the top edge is dragged", () => {
    expect(eventMove(entryOf(), { edge: "start", days: 0, minutes: -30 }, TIME_ZONE)).toMatchObject({
      startsAt: "2026-11-26T12:30:00.000Z",
      endsAt: "2026-11-26T13:45:00.000Z",
    });
  });

  it("returns null when nothing changes", () => {
    expect(eventMove(entryOf(), { edge: "move", days: 0, minutes: 0 }, TIME_ZONE)).toBeNull();
  });
});

describe("plannerCalendarAdapter with connected events", () => {
  it("lets editable events be moved and resized and sends the new times to the provider", async () => {
    const moveEvent = vi.fn().mockResolvedValue({ saved: true });
    const entry = entryOf();
    const store = adapter([entry], moveEvent);
    const [row] = store.items;

    expect(store.canMoveCalendarRecord(row)).toBe(true);
    expect(store.canResizeCalendarRecord(row)).toBe(true);
    await expect(store.moveCalendarRecord(row, { edge: "move", days: 0, minutes: 120 })).resolves.toEqual({
      saved: true,
    });
    expect(moveEvent).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        eventId: "f028e950-af9d-4389-a72c-f497a0d79d8d",
        startsAt: "2026-11-26T15:00:00.000Z",
        endsAt: "2026-11-26T15:45:00.000Z",
      }),
    );
  });

  it("keeps read-only events and pages without a mover still", async () => {
    const moveEvent = vi.fn();
    const readOnly = adapter([entryOf({ editable: false })], moveEvent);
    const withoutMover = adapter([entryOf()], null);

    expect(readOnly.canMoveCalendarRecord(readOnly.items[0])).toBe(false);
    expect(withoutMover.canMoveCalendarRecord(withoutMover.items[0])).toBe(false);
    await expect(
      readOnly.moveCalendarRecord(readOnly.items[0], { edge: "move", days: 1, minutes: 0 }),
    ).resolves.toEqual({
      saved: false,
    });
    expect(moveEvent).not.toHaveBeenCalled();
  });
});
