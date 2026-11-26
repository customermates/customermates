import { describe, expect, it, vi } from "vitest";

vi.mock("@/core/observability/server", () => ({ captureException: vi.fn(), captureMessage: vi.fn() }));

import { CustomErrorCode } from "@/core/validation/validation.types";
import { MessagingProvider } from "@/generated/prisma";

import type { WritableCalendarRow, WritableEventRow } from "../calendar-write-access.repo";

import { CalendarEventWriter, seriesTiming } from "../calendar-event-writer";

const CALENDAR: WritableCalendarRow = {
  id: "10000000-0000-4000-8000-000000000001",
  name: "Work",
  unipileCalendarId: "cal_1",
  timezone: "Europe/Berlin",
  provider: MessagingProvider.google,
  connectedAccountId: "20000000-0000-4000-8000-000000000001",
  unipileAccountId: "acc_1",
  accountStatus: "ok",
  accountLabel: "ben@example.com",
};

const EVENT_ROW: WritableEventRow = {
  id: "30000000-0000-4000-8000-000000000001",
  unipileEventId: "evt_1",
  calendarId: CALENDAR.id,
  unipileCalendarId: "cal_1",
  unipileAccountId: "acc_1",
  provider: MessagingProvider.google,
  accountStatus: "ok",
  connectedAccountId: CALENDAR.connectedAccountId,
};

const PROVIDER_EVENT = {
  id: "evt_1",
  title: "Intro call",
  start: { type: "datetime" as const, date_time: "2026-11-17T09:00:00Z", timezone: "Europe/Berlin" },
  end: { type: "datetime" as const, date_time: "2026-11-17T09:30:00Z", timezone: "Europe/Berlin" },
  attendees: [{ email: "Ada@Example.com", response_status: "noreply" as const }],
  conference: { provider: "google_meet", url: "https://meet.google.com/abc-defg-hij" },
};

const INPUT = {
  title: "Intro call",
  attendeeEmails: ["ada@example.com"],
  startsAt: new Date("2026-11-17T09:00:00.000Z"),
  endsAt: new Date("2026-11-17T09:30:00.000Z"),
  timeZone: "Europe/Berlin",
  videoLink: true,
  notifyAttendees: true,
};

function writer(overrides: { messaging?: object; store?: object } = {}) {
  const messaging = {
    createCalendarEvent: vi.fn().mockResolvedValue({ ok: true, data: PROVIDER_EVENT }),
    updateCalendarEvent: vi.fn().mockResolvedValue({ ok: true, data: PROVIDER_EVENT }),
    cancelCalendarEvent: vi.fn().mockResolvedValue({ ok: true, data: { eventId: "evt_1" } }),
    getCalendarEvent: vi.fn().mockResolvedValue({ ok: true, data: PROVIDER_EVENT }),
    ...overrides.messaging,
  };
  const store = {
    upsertCalendarEventUnscoped: vi.fn().mockResolvedValue({ id: EVENT_ROW.id }),
    markCalendarEventCancelledUnscoped: vi.fn().mockResolvedValue({ id: EVENT_ROW.id }),
    applySeriesChangeUnscoped: vi.fn().mockResolvedValue({ count: 0 }),
    markSeriesCancelledUnscoped: vi.fn().mockResolvedValue({ count: 0 }),
    ...overrides.store,
  };
  return { messaging, store, writer: new CalendarEventWriter(messaging as never, store as never) };
}

describe("CalendarEventWriter.create", () => {
  it("creates the provider event with a Meet link on Google and stores it locally with lower-cased attendee emails", async () => {
    const { messaging, store, writer: subject } = writer();

    const result = await subject.create("company-1", CALENDAR, INPUT);

    expect(messaging.createCalendarEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: "acc_1",
        calendarId: "cal_1",
        conferenceProvider: "google_meet",
        notifyAttendees: true,
        attendeeEmails: ["ada@example.com"],
      }),
    );
    expect(store.upsertCalendarEventUnscoped).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: "company-1",
        connectedAccountId: CALENDAR.connectedAccountId,
        calendarId: CALENDAR.id,
        attendeeEmails: ["ada@example.com"],
      }),
    );
    expect(result).toMatchObject({
      ok: true,
      eventId: EVENT_ROW.id,
      event: { conferenceUrl: "https://meet.google.com/abc-defg-hij", unipileEventId: "evt_1" },
    });
  });

  it("asks for Teams on Outlook and for no conference when no video link is wanted", async () => {
    const outlook = writer();
    await outlook.writer.create("company-1", { ...CALENDAR, provider: MessagingProvider.outlook }, INPUT);
    const plain = writer();
    await plain.writer.create("company-1", CALENDAR, { ...INPUT, videoLink: false });

    expect(outlook.messaging.createCalendarEvent).toHaveBeenCalledWith(
      expect.objectContaining({ conferenceProvider: "teams" }),
    );
    expect(plain.messaging.createCalendarEvent.mock.calls[0][0].conferenceProvider).toBeUndefined();
  });

  it("stores nothing and passes the provider error and retry hint on", async () => {
    const { store, writer: subject } = writer({
      messaging: {
        createCalendarEvent: vi
          .fn()
          .mockResolvedValue({ ok: false, error: CustomErrorCode.unipileRateLimit, retryAfterSeconds: 30 }),
      },
    });

    const result = await subject.create("company-1", CALENDAR, INPUT);

    expect(result).toEqual({ ok: false, error: CustomErrorCode.unipileRateLimit, retryAfterSeconds: 30 });
    expect(store.upsertCalendarEventUnscoped).not.toHaveBeenCalled();
  });

  it("cancels the provider event and reports an unconfirmed outcome when the event cannot be stored", async () => {
    const { messaging, writer: subject } = writer({
      store: { upsertCalendarEventUnscoped: vi.fn().mockRejectedValue(new Error("db down")) },
    });

    expect(await subject.create("company-1", CALENDAR, INPUT)).toEqual({
      ok: false,
      error: CustomErrorCode.unipileSendUnconfirmed,
    });
    expect(messaging.cancelCalendarEvent).toHaveBeenCalledExactlyOnceWith({
      accountId: "acc_1",
      calendarId: "cal_1",
      eventId: "evt_1",
    });
  });

  it("cancels the provider event when its answer cannot be normalised, and still fails when that cancel is refused", async () => {
    const {
      messaging,
      store,
      writer: subject,
    } = writer({
      messaging: {
        createCalendarEvent: vi.fn().mockResolvedValue({ ok: true, data: { id: "evt_2", title: "Intro call" } }),
        cancelCalendarEvent: vi.fn().mockResolvedValue({ ok: false, error: CustomErrorCode.unipileProviderRejected }),
      },
    });

    expect(await subject.create("company-1", CALENDAR, INPUT)).toEqual({
      ok: false,
      error: CustomErrorCode.unipileSendUnconfirmed,
    });
    expect(store.upsertCalendarEventUnscoped).not.toHaveBeenCalled();
    expect(messaging.cancelCalendarEvent).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ eventId: "evt_2" }),
    );
  });

  it("leaves a stored event alone, and one the provider already cancelled", async () => {
    const stored = writer();
    const cancelled = writer({
      messaging: {
        createCalendarEvent: vi.fn().mockResolvedValue({ ok: true, data: { ...PROVIDER_EVENT, is_cancelled: true } }),
      },
    });

    await stored.writer.create("company-1", CALENDAR, INPUT);
    const result = await cancelled.writer.create("company-1", CALENDAR, INPUT);

    expect(result.ok).toBe(false);
    expect(stored.messaging.cancelCalendarEvent).not.toHaveBeenCalled();
    expect(cancelled.messaging.cancelCalendarEvent).not.toHaveBeenCalled();
  });
});

describe("CalendarEventWriter.update and cancel", () => {
  it("updates through the provider and refreshes the stored event", async () => {
    const { messaging, store, writer: subject } = writer();

    const result = await subject.update("company-1", EVENT_ROW, { title: "Moved", notifyAttendees: false });

    expect(messaging.updateCalendarEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: "evt_1", calendarId: "cal_1", title: "Moved", notifyAttendees: false }),
    );
    expect(store.upsertCalendarEventUnscoped).toHaveBeenCalled();
    expect(result.ok).toBe(true);
  });

  it("marks the stored event cancelled after the provider cancelled it", async () => {
    const { messaging, store, writer: subject } = writer();

    const result = await subject.cancel(EVENT_ROW, "Sorry");

    expect(messaging.cancelCalendarEvent).toHaveBeenCalledWith({
      accountId: "acc_1",
      calendarId: "cal_1",
      eventId: "evt_1",
      comment: "Sorry",
    });
    expect(store.markCalendarEventCancelledUnscoped).toHaveBeenCalledWith({
      connectedAccountId: EVENT_ROW.connectedAccountId,
      unipileEventId: "evt_1",
    });
    expect(result).toEqual({ ok: true });
  });

  it("leaves the stored event alone when the provider refuses to cancel", async () => {
    const { store, writer: subject } = writer({
      messaging: {
        cancelCalendarEvent: vi.fn().mockResolvedValue({ ok: false, error: CustomErrorCode.unipileProviderRejected }),
      },
    });

    expect(await subject.cancel(EVENT_ROW)).toEqual({ ok: false, error: CustomErrorCode.unipileProviderRejected });
    expect(store.markCalendarEventCancelledUnscoped).not.toHaveBeenCalled();
  });

  it("sends the first and the day after the last day of an all-day event as dates", async () => {
    const { messaging, writer: subject } = writer();

    await subject.update(
      "company-1",
      { ...EVENT_ROW, allDay: true },
      { startDate: "2026-11-20", endDate: "2026-11-22" },
    );

    expect(messaging.updateCalendarEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: "evt_1",
        startDate: "2026-11-20",
        endDate: "2026-11-22",
        startsAt: undefined,
      }),
    );
  });
});

const OCCURRENCE_ROW: WritableEventRow = {
  ...EVENT_ROW,
  unipileEventId: "evt_1_20261124",
  masterUnipileEventId: "evt_master",
  allDay: false,
  startsAt: new Date("2026-11-24T09:00:00.000Z"),
  endsAt: new Date("2026-11-24T09:30:00.000Z"),
};

const MASTER_EVENT = {
  ...PROVIDER_EVENT,
  id: "evt_master",
  start: { type: "datetime" as const, date_time: "2026-11-03T09:00:00Z", timezone: "Europe/Berlin" },
  end: { type: "datetime" as const, date_time: "2026-11-03T09:30:00Z", timezone: "Europe/Berlin" },
  recurrence: ["RRULE:FREQ=WEEKLY"],
};

describe("seriesTiming", () => {
  it("moves the series start by the distance the occurrence moved and takes the new length", () => {
    expect(
      seriesTiming(
        { startsAt: new Date("2026-11-24T09:00:00.000Z"), allDay: false },
        { startsAt: new Date("2026-11-03T09:00:00.000Z"), allDay: false },
        { startsAt: new Date("2026-11-24T10:00:00.000Z"), endsAt: new Date("2026-11-24T11:00:00.000Z") },
      ),
    ).toEqual({
      master: { startsAt: new Date("2026-11-03T10:00:00.000Z"), endsAt: new Date("2026-11-03T11:00:00.000Z") },
      shift: { byMs: 3_600_000, durationMs: 3_600_000 },
    });
  });

  it("moves an all-day series by whole days and keeps the end exclusive", () => {
    expect(
      seriesTiming(
        { startsAt: new Date("2026-11-24T00:00:00.000Z"), allDay: true },
        { startsAt: new Date("2026-11-03T00:00:00.000Z"), allDay: true },
        { startDate: "2026-11-26", endDate: "2026-11-27" },
      ),
    ).toEqual({
      master: { startDate: "2026-11-05", endDate: "2026-11-06" },
      shift: { byMs: 2 * 86_400_000, durationMs: 86_400_000 },
    });
  });

  it("refuses a timed change for an all-day series", () => {
    expect(
      seriesTiming(
        { startsAt: new Date("2026-11-24T09:00:00.000Z"), allDay: false },
        { startsAt: new Date("2026-11-03T00:00:00.000Z"), allDay: true },
        { startsAt: new Date("2026-11-24T10:00:00.000Z"), endsAt: new Date("2026-11-24T11:00:00.000Z") },
      ),
    ).toBeNull();
  });
});

describe("CalendarEventWriter series changes", () => {
  it("patches the series event, re-reads the occurrence and shifts the stored occurrences", async () => {
    const occurrence = {
      ...PROVIDER_EVENT,
      id: "evt_1_20261124",
      master_event_id: "evt_master",
      start: { type: "datetime" as const, date_time: "2026-11-24T10:00:00Z", timezone: "Europe/Berlin" },
      end: { type: "datetime" as const, date_time: "2026-11-24T10:30:00Z", timezone: "Europe/Berlin" },
    };
    const getCalendarEvent = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, data: MASTER_EVENT })
      .mockResolvedValueOnce({ ok: true, data: occurrence });
    const {
      messaging,
      store,
      writer: subject,
    } = writer({
      messaging: { getCalendarEvent },
      store: { applySeriesChangeUnscoped: vi.fn().mockResolvedValue({ count: 3 }) },
    });

    const result = await subject.updateSeries("company-1", OCCURRENCE_ROW, "evt_master", {
      title: "Weekly sync",
      startsAt: new Date("2026-11-24T10:00:00.000Z"),
      endsAt: new Date("2026-11-24T10:30:00.000Z"),
      notifyAttendees: false,
    });

    expect(messaging.updateCalendarEvent).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        eventId: "evt_master",
        title: "Weekly sync",
        startsAt: new Date("2026-11-03T10:00:00.000Z"),
        endsAt: new Date("2026-11-03T10:30:00.000Z"),
        notifyAttendees: false,
      }),
    );
    expect(getCalendarEvent).toHaveBeenLastCalledWith({
      accountId: "acc_1",
      calendarId: "cal_1",
      eventId: "evt_1_20261124",
    });
    expect(store.applySeriesChangeUnscoped).toHaveBeenCalledWith({
      connectedAccountId: EVENT_ROW.connectedAccountId,
      masterUnipileEventId: "evt_master",
      exceptUnipileEventId: "evt_1_20261124",
      fields: { title: "Weekly sync" },
      shift: { byMs: 3_600_000, durationMs: 1_800_000 },
    });
    expect(store.upsertCalendarEventUnscoped).toHaveBeenCalledWith(
      expect.objectContaining({
        event: expect.objectContaining({ unipileEventId: "evt_1_20261124", masterUnipileEventId: "evt_master" }),
      }),
    );
    expect(result).toMatchObject({ ok: true, eventId: EVENT_ROW.id });
  });

  it("renames the series without reading it first when the time stays", async () => {
    const getCalendarEvent = vi.fn().mockResolvedValue({ ok: true, data: { ...PROVIDER_EVENT, id: "evt_1_20261124" } });
    const {
      messaging,
      store,
      writer: subject,
    } = writer({
      messaging: { getCalendarEvent },
      store: { applySeriesChangeUnscoped: vi.fn().mockResolvedValue({ count: 3 }) },
    });

    await subject.updateSeries("company-1", OCCURRENCE_ROW, "evt_master", { location: "Room 2" });

    expect(getCalendarEvent).toHaveBeenCalledOnce();
    expect(messaging.updateCalendarEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: "evt_master", location: "Room 2", startsAt: undefined }),
    );
    expect(store.applySeriesChangeUnscoped).toHaveBeenCalledWith(
      expect.objectContaining({ fields: { location: "Room 2" }, shift: null }),
    );
  });

  it("cancels the series event and marks every stored occurrence cancelled", async () => {
    const {
      messaging,
      store,
      writer: subject,
    } = writer({
      store: { markSeriesCancelledUnscoped: vi.fn().mockResolvedValue({ count: 4 }) },
    });

    expect(await subject.cancelSeries(OCCURRENCE_ROW, "evt_master")).toEqual({ ok: true });
    expect(messaging.cancelCalendarEvent).toHaveBeenCalledWith(expect.objectContaining({ eventId: "evt_master" }));
    expect(store.markSeriesCancelledUnscoped).toHaveBeenCalledWith({
      connectedAccountId: EVENT_ROW.connectedAccountId,
      masterUnipileEventId: "evt_master",
    });
    expect(store.markCalendarEventCancelledUnscoped).not.toHaveBeenCalled();
  });
});
