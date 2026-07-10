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

import { BackfillCalendarsInteractor } from "../backfill-calendars.interactor";

const CONNECTED_ACCOUNT_ID = "33333333-3333-4333-8333-333333333333";
const account = {
  id: "acc-1",
  companyId: "co-1",
  unipileAccountId: "acc_uni-1",
  provider: "google",
  status: "ok",
} as any;

const validCalendar = { id: "cal-1", name: "Work", description: null, background_color: null, timezone: null };

function build(events: unknown[]) {
  const messagingService = {
    listCalendars: vi.fn().mockResolvedValue({ data: [validCalendar], next_cursor: null }),
    listCalendarEvents: vi.fn().mockResolvedValue({ data: events, next_cursor: null }),
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
  const interactor = new BackfillCalendarsInteractor(repo as any, messagingService as any, calendarRepo as any);

  return { interactor, messagingService, calendarRepo, repo };
}

function invoke(interactor: BackfillCalendarsInteractor) {
  return interactor.invoke({ connectedAccountId: CONNECTED_ACCOUNT_ID } as any);
}

beforeEach(() => vi.clearAllMocks());

describe("calendar backfill", () => {
  it("dead-letters a genuinely malformed event (schema parse failure)", async () => {
    const { interactor, calendarRepo, repo } = build([{ not: "an event" }]);

    await invoke(interactor);

    expect(repo.recordUnusableItemUnscoped).toHaveBeenCalledOnce();
    expect(repo.recordUnusableItemUnscoped.mock.calls[0][0].unipileMessageId).toBeUndefined();
    expect(calendarRepo.upsertCalendarEventUnscoped).not.toHaveBeenCalled();
  });

  it("dead-letters an event that parses but has no start time", async () => {
    const { interactor, calendarRepo, repo } = build([{ id: "ev-x" }]);

    await invoke(interactor);

    expect(repo.recordUnusableItemUnscoped).toHaveBeenCalledOnce();
    expect(repo.recordUnusableItemUnscoped.mock.calls[0][0].unipileMessageId).toBe("ev-x");
    expect(calendarRepo.upsertCalendarEventUnscoped).not.toHaveBeenCalled();
  });

  it("on write failure dead-letters the event", async () => {
    const validEvent = {
      id: "ev-1",
      start: { type: "datetime", date_time: "2026-07-08T10:00:00.000Z" },
      end: { type: "datetime", date_time: "2026-07-08T11:00:00.000Z" },
    };
    const { interactor, calendarRepo, repo } = build([validEvent]);
    calendarRepo.upsertCalendarEventUnscoped.mockRejectedValueOnce(new Error("db down"));

    await invoke(interactor);

    expect(repo.recordUnusableItemUnscoped).toHaveBeenCalledOnce();
    expect(repo.recordUnusableItemUnscoped.mock.calls[0][0].unipileMessageId).toBe("ev-1");
  });

  it("ingests a valid event with zero dead-letters", async () => {
    const validEvent = {
      id: "ev-1",
      start: { type: "datetime", date_time: "2026-07-08T10:00:00.000Z" },
      end: { type: "datetime", date_time: "2026-07-08T11:00:00.000Z" },
    };
    const { interactor, calendarRepo, repo } = build([validEvent]);

    await invoke(interactor);

    expect(calendarRepo.upsertCalendarEventUnscoped).toHaveBeenCalledOnce();
    expect(repo.recordUnusableItemUnscoped).not.toHaveBeenCalled();
  });
});
