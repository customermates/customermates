import { describe, expect, it, vi } from "vitest";

import type { PersonalCalendarEvent } from "@/features/planner/planner.repo";

import { ConnectedAccountStatus, MessagingProvider } from "@/generated/prisma";
import {
  plannerEventEditable,
  plannerEventHasGuests,
  plannerEventReadOnlyReason,
} from "@/ee/calendar/own-calendar-account";
import { plannerEntries } from "@/features/planner/planner-entries";

import { eventMove, plannerCalendarAdapter, plannerMoveQuestion } from "../planner-calendar-adapter";

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
  const single = { recurrenceRule: null };

  it("allows timed, all-day and single occurrences in the viewer's own working Google or Outlook calendar", () => {
    expect(plannerEventEditable(single, own, "me")).toBe(true);
    expect(plannerEventEditable(single, { ...own, provider: MessagingProvider.outlook }, "me")).toBe(true);
  });

  it("keeps shared calendars, broken connections and series synced without occurrences read-only", () => {
    expect(plannerEventEditable(single, own, "someone-else")).toBe(false);
    expect(plannerEventEditable(single, { ...own, status: ConnectedAccountStatus.credentials }, "me")).toBe(false);
    expect(plannerEventEditable({ recurrenceRule: "RRULE:FREQ=WEEKLY" }, own, "me")).toBe(false);
  });

  it("names the reason only for the viewer's own series, not for a teammate's calendar", () => {
    expect(plannerEventReadOnlyReason({ recurrenceRule: "RRULE:FREQ=WEEKLY" }, own, "me")).toBe("series");
    expect(plannerEventReadOnlyReason({ recurrenceRule: "RRULE:FREQ=WEEKLY" }, own, "someone-else")).toBeNull();
    expect(plannerEventReadOnlyReason(single, own, "me")).toBeNull();
  });
});

describe("plannerEventHasGuests", () => {
  it("counts attendees other than the account owner and the organizer", () => {
    const owner = "max@example.com";
    expect(plannerEventHasGuests([{ email: "Max@Example.com", isOrganizer: true }], owner)).toBe(false);
    expect(plannerEventHasGuests([{ email: "max@example.com", isOrganizer: false }], owner)).toBe(false);
    expect(
      plannerEventHasGuests(
        [
          { email: "max@example.com", isOrganizer: true },
          { email: "sam@example.com", isOrganizer: false },
        ],
        owner,
      ),
    ).toBe(true);
    expect(plannerEventHasGuests(null, owner)).toBe(false);
  });
});

describe("planner entries of connected events", () => {
  it("carry the event id, whether the viewer may move them and what a move has to ask", () => {
    expect(entryOf()).toMatchObject({ eventId: "f028e950-af9d-4389-a72c-f497a0d79d8d", editable: true, record: null });
    expect(entryOf({ editable: false }).editable).toBe(false);
    expect(entryOf({ editable: undefined }).editable).toBe(false);
    expect(
      entryOf({ allDay: true, startsAt: "2026-11-26T00:00:00.000Z", endsAt: "2026-11-27T00:00:00.000Z" }),
    ).toMatchObject({ editable: true, allDay: true });
    expect(entryOf({ recurring: true, hasGuests: true })).toMatchObject({ recurring: true, hasGuests: true });
    expect(entryOf({ editable: false, readOnlyReason: "series" }).readOnlyReason).toBe("series");
  });
});

describe("plannerMoveQuestion", () => {
  it("asks for the scope of a repeating meeting and whether Google should notify other attendees", () => {
    expect(plannerMoveQuestion({ recurring: false, hasGuests: false, provider: "google" })).toEqual({
      scope: false,
      notify: false,
    });
    expect(plannerMoveQuestion({ recurring: false, hasGuests: true, provider: "google" })).toEqual({
      scope: false,
      notify: true,
    });
    expect(plannerMoveQuestion({ recurring: true, hasGuests: false, provider: "google" })).toEqual({
      scope: true,
      notify: false,
    });
  });

  it("does not offer a quiet move on Microsoft, which always sends the update", () => {
    expect(plannerMoveQuestion({ recurring: false, hasGuests: true, provider: "outlook" })).toEqual({
      scope: false,
      notify: false,
    });
  });
});

describe("eventMove", () => {
  it("moves start and end together by days and minutes, keeping the length", () => {
    expect(eventMove(entryOf(), { edge: "move", days: 1, minutes: 60 }, TIME_ZONE)).toEqual({
      entryId: "event:f028e950-af9d-4389-a72c-f497a0d79d8d",
      eventId: "f028e950-af9d-4389-a72c-f497a0d79d8d",
      timing: { startsAt: "2026-11-27T14:00:00.000Z", endsAt: "2026-11-27T14:45:00.000Z" },
      previous: { startsAt: "2026-11-26T13:00:00.000Z", endsAt: "2026-11-26T13:45:00.000Z" },
    });
  });

  it("changes only the end when the bottom edge is dragged, and never below 15 minutes", () => {
    expect(eventMove(entryOf(), { edge: "end", days: 0, minutes: 30 }, TIME_ZONE)?.timing).toEqual({
      startsAt: "2026-11-26T13:00:00.000Z",
      endsAt: "2026-11-26T14:15:00.000Z",
    });
    expect(eventMove(entryOf(), { edge: "end", days: 0, minutes: -60 }, TIME_ZONE)?.timing).toEqual({
      startsAt: "2026-11-26T13:00:00.000Z",
      endsAt: "2026-11-26T13:15:00.000Z",
    });
  });

  it("changes only the start when the top edge is dragged", () => {
    expect(eventMove(entryOf(), { edge: "start", days: 0, minutes: -30 }, TIME_ZONE)?.timing).toEqual({
      startsAt: "2026-11-26T12:30:00.000Z",
      endsAt: "2026-11-26T13:45:00.000Z",
    });
  });

  it("moves an all-day event by whole days and sends its first and last day", () => {
    const allDay = entryOf({ allDay: true, startsAt: "2026-11-26T00:00:00.000Z", endsAt: "2026-11-28T00:00:00.000Z" });
    expect(eventMove(allDay, { edge: "move", days: 2, minutes: 0 }, TIME_ZONE)).toEqual({
      entryId: "event:f028e950-af9d-4389-a72c-f497a0d79d8d",
      eventId: "f028e950-af9d-4389-a72c-f497a0d79d8d",
      timing: { startDate: "2026-11-28", endDate: "2026-11-29" },
      previous: { startDate: "2026-11-26", endDate: "2026-11-27" },
    });
    expect(eventMove(allDay, { edge: "end", days: 1, minutes: 0 }, TIME_ZONE)?.timing).toEqual({
      startDate: "2026-11-26",
      endDate: "2026-11-28",
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
        timing: { startsAt: "2026-11-26T15:00:00.000Z", endsAt: "2026-11-26T15:45:00.000Z" },
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
