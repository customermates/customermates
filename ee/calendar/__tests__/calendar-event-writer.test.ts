import { describe, expect, it, vi } from "vitest";

vi.mock("@/core/observability/server", () => ({ captureException: vi.fn(), captureMessage: vi.fn() }));

import { CustomErrorCode } from "@/core/validation/validation.types";
import { MessagingProvider } from "@/generated/prisma";

import type { WritableCalendarRow, WritableEventRow } from "../calendar-write-access.repo";

import { CalendarEventWriter } from "../calendar-event-writer";

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
    ...overrides.messaging,
  };
  const store = {
    upsertCalendarEventUnscoped: vi.fn().mockResolvedValue({ id: EVENT_ROW.id }),
    markCalendarEventCancelledUnscoped: vi.fn().mockResolvedValue({ id: EVENT_ROW.id }),
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

  it("reports an unconfirmed outcome when the event exists at the provider but cannot be stored", async () => {
    const { writer: subject } = writer({
      store: { upsertCalendarEventUnscoped: vi.fn().mockRejectedValue(new Error("db down")) },
    });

    expect(await subject.create("company-1", CALENDAR, INPUT)).toEqual({
      ok: false,
      error: CustomErrorCode.unipileSendUnconfirmed,
    });
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
});
