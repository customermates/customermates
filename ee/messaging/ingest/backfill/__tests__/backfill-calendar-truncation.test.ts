import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockUser } from "@/tests/helpers/mock-user";
import {
  MOCK_ENV_MODULE,
  createMockDiModule,
  MOCK_ZOD_MODULE,
  MOCK_PRISMA_DB_MODULE,
} from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => ({ ...createMockDiModule(() => mockUser) }));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);
vi.mock("@sentry/node", () => ({ captureException: vi.fn(), captureMessage: vi.fn() }));

import * as Sentry from "@sentry/node";

import { BackfillCalendarsInteractor } from "../backfill-calendars.interactor";
import { UNIPILE_CALENDAR_EVENT_MAX_LIMIT } from "../paginate";
import { UnipileRequestError } from "../../../messaging.service";

const CONNECTED_ACCOUNT_ID = "44444444-4444-4444-8444-444444444444";
const account = {
  id: "acc-1",
  companyId: "co-1",
  unipileAccountId: "acc_uni-1",
  provider: "google",
  status: "ok",
} as never;

const calendar = { id: "cal-1", name: "Work", description: null, background_color: null, timezone: null };

function event(index: number) {
  return {
    id: `evt-${index}`,
    title: "busy",
    start: { dateTime: "2026-08-01T10:00:00.000Z" },
    end: { dateTime: "2026-08-01T11:00:00.000Z" },
  };
}

function build(listCalendarEvents: ReturnType<typeof vi.fn>) {
  const messagingService = {
    listCalendars: vi.fn().mockResolvedValue({ data: [calendar], next_cursor: null }),
    listCalendarEvents,
  };
  const calendarRepo = {
    upsertCalendarUnscoped: vi.fn().mockResolvedValue({ id: "calendar-row-1" }),
    upsertCalendarEventUnscoped: vi.fn().mockResolvedValue({ id: "event-row-1" }),
  };
  const repo = {
    findAccountByIdUnscoped: vi.fn().mockResolvedValue(account),
    recordUnusableItemUnscoped: vi.fn().mockResolvedValue(undefined),
    markAccountHasCalendarUnscoped: vi.fn().mockResolvedValue(undefined),
  };

  return {
    interactor: new BackfillCalendarsInteractor(repo as never, messagingService as never, calendarRepo as never),
    messagingService,
  };
}

const invoke = (interactor: BackfillCalendarsInteractor) =>
  interactor.invoke({ connectedAccountId: CONNECTED_ACCOUNT_ID } as never);

beforeEach(() => vi.clearAllMocks());

describe("calendar event backfill against an endpoint that cannot paginate", () => {
  it("asks for the largest page the endpoint allows", async () => {
    const listCalendarEvents = vi.fn().mockResolvedValue({ data: [event(0)], next_cursor: null });
    const { interactor, messagingService } = build(listCalendarEvents);

    await invoke(interactor);

    expect(messagingService.listCalendarEvents).toHaveBeenCalledWith(
      expect.objectContaining({ limit: UNIPILE_CALENDAR_EVENT_MAX_LIMIT }),
    );
  });

  it("reports a walk that stopped on the cursor rejection instead of finishing silently", async () => {
    const full = Array.from({ length: UNIPILE_CALENDAR_EVENT_MAX_LIMIT }, (_, i) => event(i));
    const listCalendarEvents = vi
      .fn()
      .mockResolvedValueOnce({ data: full, next_cursor: null })
      .mockRejectedValueOnce(
        new UnipileRequestError(
          400,
          "provider/invalid_parameters",
          '{"detail":"Google Calendar use cursor for pagination."}',
        ),
      );
    const { interactor } = build(listCalendarEvents);

    await invoke(interactor);

    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      expect.stringContaining("stopped before the end"),
      expect.objectContaining({ level: "warning" }),
    );
  });

  it("stays quiet when the calendar genuinely ends", async () => {
    const listCalendarEvents = vi.fn().mockResolvedValue({ data: [event(0), event(1)], next_cursor: null });
    const { interactor } = build(listCalendarEvents);

    await invoke(interactor);

    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });
});
