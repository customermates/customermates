import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";
import {
  MOCK_ENV_MODULE,
  MOCK_PRISMA_DB_MODULE,
  MOCK_ZOD_MODULE,
  createMockDiModule,
} from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => ({ ...createMockDiModule(() => mockUser) }));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);

import { ProcessCalendarEventDeleteWebhookInteractor } from "../calendar/process-calendar-event-delete-webhook.interactor";
import { ProcessCalendarEventUpsertWebhookInteractor } from "../calendar/process-calendar-event-upsert-webhook.interactor";

const account = {
  id: "acc-1",
  companyId: "co-1",
  unipileAccountId: "acc_uni-1",
  provider: "google",
  status: "ok",
  hasCalendar: true,
} as never;

const EVENT_ID = "ev-local-1";

function accountRepo(found: unknown = account) {
  return {
    findAccountByUnipileIdUnscoped: vi.fn().mockResolvedValue(found),
    markAccountHasCalendarUnscoped: vi.fn(),
  };
}

function build() {
  const calendarRepo = {
    findOrCreateCalendarByUnipileIdUnscoped: vi.fn().mockResolvedValue({ id: "cal-local-1" }),
    upsertCalendarEventUnscoped: vi.fn().mockResolvedValue({ id: EVENT_ID }),
    deleteCalendarEventUnscoped: vi.fn().mockResolvedValue({ id: EVENT_ID }),
  };
  const eventService = { publish: vi.fn().mockResolvedValue(undefined) };
  const bookings = { eventCancelled: vi.fn().mockResolvedValue(1), eventAt: vi.fn().mockResolvedValue(1) };
  return { calendarRepo, eventService, bookings };
}

beforeEach(() => vi.clearAllMocks());

describe("calendar.event.delete releases the booking", () => {
  const envelope = {
    type: "calendar.event.delete",
    account_id: "acc_uni-1",
    payload: { id: "ev-1", calendar_id: "cal-1" },
  } as never;

  it("cancels the open bookings of the deleted event before announcing the change", async () => {
    const { calendarRepo, eventService, bookings } = build();
    const interactor = new ProcessCalendarEventDeleteWebhookInteractor(
      calendarRepo as never,
      accountRepo() as never,
      eventService as never,
      bookings,
    );

    await interactor.invoke(envelope);

    expect(bookings.eventCancelled).toHaveBeenCalledExactlyOnceWith({
      companyId: "co-1",
      calendarEventId: EVENT_ID,
    });
    expect(bookings.eventAt).not.toHaveBeenCalled();
    expect(eventService.publish).toHaveBeenCalledOnce();
    expect(bookings.eventCancelled.mock.invocationCallOrder[0]).toBeLessThan(
      eventService.publish.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("does nothing for an event that was never stored or an account that is gone", async () => {
    const unknown = build();
    unknown.calendarRepo.deleteCalendarEventUnscoped.mockResolvedValue(null);
    await new ProcessCalendarEventDeleteWebhookInteractor(
      unknown.calendarRepo as never,
      accountRepo() as never,
      unknown.eventService as never,
      unknown.bookings,
    ).invoke(envelope);
    const gone = build();
    await new ProcessCalendarEventDeleteWebhookInteractor(
      gone.calendarRepo as never,
      accountRepo(null) as never,
      gone.eventService as never,
      gone.bookings,
    ).invoke(envelope);

    expect(unknown.bookings.eventCancelled).not.toHaveBeenCalled();
    expect(gone.bookings.eventCancelled).not.toHaveBeenCalled();
  });
});

describe("calendar.event.update keeps the booking in step with its event", () => {
  const event = (overrides: Record<string, unknown> = {}) =>
    ({
      type: "calendar.event.update",
      account_id: "acc_uni-1",
      payload: {
        id: "ev-1",
        calendar_id: "cal-1",
        title: "Intro call",
        start: { type: "datetime", date_time: "2030-01-15T09:00:00.000Z" },
        end: { type: "datetime", date_time: "2030-01-15T09:30:00.000Z" },
        ...overrides,
      },
    }) as never;

  function interactor() {
    const built = build();
    return {
      ...built,
      run: (input: never) =>
        new ProcessCalendarEventUpsertWebhookInteractor(
          built.calendarRepo as never,
          accountRepo() as never,
          built.eventService as never,
          built.bookings,
        ).invoke(input),
    };
  }

  it("moves the booking to the time the event now sits at instead of cancelling it", async () => {
    const { run, bookings } = interactor();

    await run(event());

    expect(bookings.eventAt).toHaveBeenCalledExactlyOnceWith({
      companyId: "co-1",
      calendarEventId: EVENT_ID,
      startsAt: new Date("2030-01-15T09:00:00.000Z"),
      endsAt: new Date("2030-01-15T09:30:00.000Z"),
    });
    expect(bookings.eventCancelled).not.toHaveBeenCalled();
  });

  it("cancels the booking whatever the time when the provider cancelled the event", async () => {
    const { run, bookings } = interactor();

    await run(event({ is_cancelled: true }));

    expect(bookings.eventCancelled).toHaveBeenCalledExactlyOnceWith({
      companyId: "co-1",
      calendarEventId: EVENT_ID,
    });
    expect(bookings.eventAt).not.toHaveBeenCalled();
  });

  it("leaves the booking alone when the event became an all-day event", async () => {
    const { run, bookings } = interactor();

    await run(event({ start: { type: "date", date: "2030-01-15" }, end: { type: "date", date: "2030-01-16" } }));

    expect(bookings.eventAt).not.toHaveBeenCalled();
    expect(bookings.eventCancelled).not.toHaveBeenCalled();
  });
});
