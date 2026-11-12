import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockUser } from "@/tests/helpers/mock-user";
import {
  MOCK_ENV_MODULE,
  createMockDiModule,
  MOCK_ZOD_MODULE,
  MOCK_PRISMA_DB_MODULE,
} from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();

vi.mock("@/env", () => ({ env: { ...MOCK_ENV_MODULE.env, UNIPILE_API_KEY: "test-key" } }));
vi.mock("@/core/di", () => ({ ...createMockDiModule(() => mockUser) }));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);
vi.mock("@/core/observability/server", () => ({ captureException: vi.fn(), captureMessage: vi.fn() }));

import { CustomErrorCode } from "@/core/validation/validation.types";
import { MessagingService } from "../messaging.service";

const EVENT = {
  object: "CalendarEvent",
  id: "evt_1",
  calendar_id: "cal_1",
  title: "Intro call",
  start: { type: "datetime", date_time: "2026-11-17T09:00:00Z", timezone: "Europe/Berlin" },
  end: { type: "datetime", date_time: "2026-11-17T09:30:00Z", timezone: "Europe/Berlin" },
  attendees: [{ email: "ada@example.com" }],
};

function stubFetch(body: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockImplementation(
        () =>
          new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }),
      ),
  );
}

function request(index = 0) {
  const [input, init] = vi.mocked(fetch).mock.calls[index];
  const url = new URL(input instanceof Request ? input.url : String(input));
  const method = input instanceof Request ? input.method : (init?.method ?? "GET");
  const body = init?.body instanceof ArrayBuffer ? new TextDecoder().decode(init.body) : "";
  return { url, method, body: body ? (JSON.parse(body) as Record<string, unknown>) : null };
}

const BASE_INPUT = {
  accountId: "acc_1",
  calendarId: "cal_1",
  title: "Intro call",
  description: "Agenda",
  attendeeEmails: ["ada@example.com"],
  startsAt: new Date("2026-11-17T09:00:00.000Z"),
  endsAt: new Date("2026-11-17T09:30:00.000Z"),
  timeZone: "Europe/Berlin",
  notifyAttendees: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("MessagingService calendar write", () => {
  it("creates an event with attendees, a UTC start and end, the zone and an invitation", async () => {
    stubFetch(EVENT, 201);

    const result = await new MessagingService().createCalendarEvent({ ...BASE_INPUT, conferenceProvider: "google_meet" });

    expect(result).toMatchObject({ ok: true, data: { id: "evt_1" } });
    const sent = request();
    expect(sent.method).toBe("POST");
    expect(sent.url.pathname).toBe("/v2/acc_1/calendars/cal_1/events");
    expect(sent.body).toEqual({
      title: "Intro call",
      body: "Agenda",
      attendees: [{ email: "ada@example.com" }],
      start: { type: "datetime", date_time: "2026-11-17T09:00:00Z", timezone: "Europe/Berlin" },
      end: { type: "datetime", date_time: "2026-11-17T09:30:00Z", timezone: "Europe/Berlin" },
      conference: { provider: "google_meet" },
      notify: "all",
    });
  });

  it("asks the provider to stay quiet when invitations are off and sends no conference by default", async () => {
    stubFetch(EVENT, 201);

    await new MessagingService().createCalendarEvent({ ...BASE_INPUT, notifyAttendees: false });

    expect(request().body).toMatchObject({ notify: "none" });
    expect(request().body).not.toHaveProperty("conference");
  });

  it("reads the event back when the provider answers with the id only", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Response(JSON.stringify({ object: "CalendarEventCreated", event_id: "evt_1" }), {
              status: 201,
              headers: { "content-type": "application/json" },
            }),
        )
        .mockImplementationOnce(
          () => new Response(JSON.stringify(EVENT), { status: 200, headers: { "content-type": "application/json" } }),
        ),
    );

    const result = await new MessagingService().createCalendarEvent(BASE_INPUT);

    expect(result).toMatchObject({ ok: true, data: { id: "evt_1", title: "Intro call" } });
    expect(request(1).method).toBe("GET");
    expect(request(1).url.pathname).toBe("/v2/acc_1/calendars/cal_1/events/evt_1");
  });

  it("updates only the fields it is given with PATCH", async () => {
    stubFetch(EVENT);

    await new MessagingService().updateCalendarEvent({
      accountId: "acc_1",
      calendarId: "cal_1",
      eventId: "evt_1",
      title: "Moved call",
      startsAt: BASE_INPUT.startsAt,
      endsAt: BASE_INPUT.endsAt,
      timeZone: "Europe/Berlin",
    });

    const sent = request();
    expect(sent.method).toBe("PATCH");
    expect(sent.url.pathname).toBe("/v2/acc_1/calendars/cal_1/events/evt_1");
    expect(Object.keys(sent.body ?? {}).sort()).toEqual(["end", "start", "title"]);
  });

  it("cancels an event through the cancel endpoint and tells the attendees", async () => {
    stubFetch({ object: "CalendarEventCancelled" });

    const result = await new MessagingService().cancelCalendarEvent({
      accountId: "acc_1",
      calendarId: "cal_1",
      eventId: "evt_1",
      comment: "Sorry, something came up",
    });

    expect(result).toEqual({ ok: true, data: { eventId: "evt_1" } });
    const sent = request();
    expect(sent.method).toBe("POST");
    expect(sent.url.pathname).toBe("/v2/acc_1/calendars/cal_1/events/evt_1/cancel");
    expect(sent.body).toEqual({ comment: "Sorry, something came up" });
  });

  it("maps a disconnected account to the account error", async () => {
    stubFetch({ type: "provider/invalid_credentials", status: 401 }, 401);

    const result = await new MessagingService().createCalendarEvent(BASE_INPUT);

    expect(result).toEqual({ ok: false, error: CustomErrorCode.unipileDisconnectedAccount });
  });

  it("reports an unknown outcome when the provider fails mid-request", async () => {
    stubFetch({ type: "api/internal_error", status: 500 }, 500);

    const result = await new MessagingService().createCalendarEvent(BASE_INPUT);

    expect(result).toEqual({ ok: false, error: CustomErrorCode.unipileSendOutcomeUnknown });
  });

  it("reports an unreadable success response as unconfirmed", async () => {
    stubFetch({ object: "CalendarEvent" }, 201);

    const result = await new MessagingService().createCalendarEvent(BASE_INPUT);

    expect(result).toEqual({ ok: false, error: CustomErrorCode.unipileSendUnconfirmed });
  });
});
