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

import { ProcessMessageNewWebhookInteractor } from "../message/process-message-new-webhook.interactor";
import { ProcessEmailNewWebhookInteractor } from "../email/process-email-new-webhook.interactor";
import { ProcessCalendarEventUpsertWebhookInteractor } from "../calendar/process-calendar-event-upsert-webhook.interactor";
import { UnmappableWebhookPayloadError } from "@/core/errors/app-errors";

const isUnmappable = (err: unknown) => err instanceof UnmappableWebhookPayloadError;

const account = {
  id: "acc-1",
  companyId: "co-1",
  unipileAccountId: "acc_uni-1",
  provider: "google",
  status: "ok",
  emailAddress: "me@ex.com",
  sentFolderIds: [],
} as any;

function accountRepo() {
  return {
    findAccountByUnipileIdOrThrowUnscoped: vi.fn().mockResolvedValue(account),
    findAccountByUnipileIdUnscoped: vi.fn().mockResolvedValue(account),
  };
}

beforeEach(() => vi.clearAllMocks());

describe("message.new mapper-null handling", () => {
  it("throws an unmappable error carrying the message id when normalization fails", async () => {
    const ingest = { ingestMessageUnscoped: vi.fn() };
    const interactor = new ProcessMessageNewWebhookInteractor(ingest as any, accountRepo() as any, {} as any);

    const call = interactor.invoke({
      type: "message.new",
      account_id: "acc_uni-1",
      payload: { id: "m-1", chat_id: "c-1", timestamp: "not-a-date" },
    } as any);

    await expect(call).rejects.toSatisfy(isUnmappable);
    await expect(call).rejects.toMatchObject({ unipileMessageId: "m-1" });
    expect(ingest.ingestMessageUnscoped).not.toHaveBeenCalled();
  });

  it("silently returns for an excluded chat without ingesting or throwing", async () => {
    const ingest = { ingestMessageUnscoped: vi.fn() };
    const interactor = new ProcessMessageNewWebhookInteractor(ingest as any, accountRepo() as any, {} as any);

    await expect(
      interactor.invoke({
        type: "message.new",
        account_id: "acc_uni-1",
        payload: { id: "m-1", chat_id: "123@newsletter", timestamp: "2026-07-08T10:00:00.000Z" },
      } as any),
    ).resolves.toBeUndefined();

    expect(ingest.ingestMessageUnscoped).not.toHaveBeenCalled();
  });
});

describe("email.new mapper-null handling", () => {
  it("throws an unmappable error with a null id for an empty email shell", async () => {
    const ingest = { ingestMessageUnscoped: vi.fn() };
    const interactor = new ProcessEmailNewWebhookInteractor(ingest as any, accountRepo() as any, {} as any);

    const call = interactor.invoke({
      type: "email.new",
      account_id: "acc_uni-1",
      payload: {
        email: { id: "", message_id: "", thread_id: "", subject: "", body: "", date: "2026-07-08T10:00:00.000Z" },
      },
    } as any);

    await expect(call).rejects.toSatisfy(isUnmappable);
    await expect(call).rejects.toMatchObject({ unipileMessageId: null });
    expect(ingest.ingestMessageUnscoped).not.toHaveBeenCalled();
  });
});

describe("calendar.event.upsert mapper-null handling", () => {
  it("throws an unmappable error carrying the event id when the event has no start", async () => {
    const calendarRepo = { findOrCreateCalendarByUnipileIdUnscoped: vi.fn(), upsertCalendarEventUnscoped: vi.fn() };
    const interactor = new ProcessCalendarEventUpsertWebhookInteractor(
      calendarRepo as any,
      accountRepo() as any,
      {} as any,
    );

    const call = interactor.invoke({
      type: "calendar.event.new",
      account_id: "acc_uni-1",
      payload: { id: "ev-x", calendar_id: "cal-1" },
    } as any);

    await expect(call).rejects.toSatisfy(isUnmappable);
    await expect(call).rejects.toMatchObject({ unipileMessageId: "ev-x" });
    expect(calendarRepo.upsertCalendarEventUnscoped).not.toHaveBeenCalled();
  });
});
