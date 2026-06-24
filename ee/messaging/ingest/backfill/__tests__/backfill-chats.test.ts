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

import { BackfillChatsInteractor } from "../backfill-chats.interactor";

const account = {
  id: "acc-1",
  companyId: "co-1",
  unipileAccountId: "uni-1",
  provider: "whatsapp",
} as any;

function build(overrides: { chats?: unknown[]; messages?: unknown[]; attendees?: unknown[] }) {
  const messagingService = {
    listChats: vi.fn().mockResolvedValue({ items: overrides.chats ?? [], cursor: null }),
    listMessages: vi.fn().mockResolvedValue({ items: overrides.messages ?? [], cursor: null }),
    listChatAttendees: vi.fn().mockResolvedValue({ items: overrides.attendees ?? [], cursor: null }),
  };
  const ingest = {
    upsertChatThread: vi.fn().mockResolvedValue(undefined),
    ingestMessage: vi.fn().mockResolvedValue({ isEcho: true }),
    countMessagesUnscoped: vi.fn().mockResolvedValue(0),
  };
  const repo = {
    saveBackfillStepCheckpointUnscoped: vi.fn().mockResolvedValue(undefined),
    recordUnusableItemUnscoped: vi.fn().mockResolvedValue(undefined),
    setAccountOwnAttendeeIdUnscoped: vi.fn().mockResolvedValue(undefined),
  };
  const interactor = new BackfillChatsInteractor(repo as any, messagingService as any, ingest as any);

  return { interactor, messagingService, ingest, repo };
}

const invokeArgs = { account, afterDate: new Date("2025-01-01T00:00:00.000Z"), checkpoint: {}, epoch: 0 };

describe("BackfillChatsInteractor lazy rosters", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does not fetch any chat rosters during the metadata sweep", async () => {
    const { interactor, messagingService, ingest } = build({
      chats: [{ id: "c1", name: "Group", timestamp: 1700000000000 }],
      messages: [],
    });

    await interactor.invoke(invokeArgs as any);

    expect(messagingService.listChatAttendees).not.toHaveBeenCalled();
    expect(ingest.upsertChatThread).toHaveBeenCalledTimes(1);
    expect(ingest.upsertChatThread.mock.calls[0][0].participants).toEqual([]);
  });

  it("lazily loads and persists a chat roster while processing its messages, and saves the message cursor", async () => {
    const { interactor, messagingService, ingest, repo } = build({
      chats: [{ id: "c1", name: "Group", timestamp: 1700000000000 }],
      messages: [
        {
          id: "m1",
          chat_id: "c1",
          sender_id: "a1",
          sender_attendee_id: "a1",
          is_sender: false,
          timestamp: 1700000001000,
          text: "hi",
        },
      ],
      attendees: [
        { id: "self", is_self: true },
        { id: "a1", provider_id: "a1", name: "Bob" },
      ],
    });

    await interactor.invoke(invokeArgs as any);

    expect(messagingService.listChatAttendees).toHaveBeenCalledTimes(1);
    expect(messagingService.listChatAttendees.mock.calls[0][0].chatId).toBe("c1");

    const persistedRoster = ingest.upsertChatThread.mock.calls.some((call: any[]) => call[0].participants.length > 0);
    expect(persistedRoster).toBe(true);

    expect(ingest.ingestMessage).toHaveBeenCalledTimes(1);
    expect(repo.saveBackfillStepCheckpointUnscoped).toHaveBeenCalled();
  });
});
