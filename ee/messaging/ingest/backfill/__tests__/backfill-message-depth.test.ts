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

import { BackfillChatsInteractor } from "../backfill-chats.interactor";
import { BACKFILL_MESSAGE_PAGE_BUDGET, UNIPILE_MAX_LIMIT } from "../paginate";
import { ACCOUNT_WIDE_SOURCE } from "../prepare-backfill.interactor";

const CONNECTED_ACCOUNT_ID = "66666666-6666-4666-8666-666666666666";
const account = {
  id: "acc-1",
  companyId: "co-1",
  unipileAccountId: "acc_uni-1",
  provider: "whatsapp",
  status: "ok",
  displayName: "+4900000000",
} as never;

const chat = { id: "chat-1@s.whatsapp.net", name: "Long Thread", is_group: false, is_channel: false, type: "1to1" };

function message(i: number) {
  return {
    id: `msg-${i}`,
    chat_id: chat.id,
    text: `message ${i}`,
    timestamp: "2026-08-01T10:00:00.000Z",
    is_sender: false,
    sender: { id: "them", display_name: "Them", public_identifier: "+4911111111" },
  };
}

function build(listChatMessages: ReturnType<typeof vi.fn>) {
  const messagingService = {
    listChats: vi.fn().mockResolvedValue({ data: [chat], next_cursor: null }),
    listChatMessages,
    listChatParticipants: vi.fn().mockResolvedValue({ data: [], next_cursor: null }),
  };
  const ingest = {
    upsertChatThreadUnscoped: vi.fn().mockResolvedValue({ id: "thread-1" }),
    ingestMessageUnscoped: vi.fn().mockResolvedValue({ isEcho: false, message: { id: "m" } }),
    recordUnusableItemUnscoped: vi.fn().mockResolvedValue(undefined),
  };
  const repo = {
    findAccountByIdUnscoped: vi.fn().mockResolvedValue(account),
    recordUnusableItemUnscoped: vi.fn().mockResolvedValue(undefined),
  };

  return {
    interactor: new BackfillChatsInteractor(repo as never, messagingService as never, ingest as never),
    messagingService,
    ingest,
  };
}

const invoke = (i: BackfillChatsInteractor) =>
  i.invoke({ connectedAccountId: CONNECTED_ACCOUNT_ID, source: ACCOUNT_WIDE_SOURCE, cursor: null } as never);

const fullPage = (offset: number) => Array.from({ length: UNIPILE_MAX_LIMIT }, (_, i) => message(offset + i));

beforeEach(() => vi.clearAllMocks());

describe("chat message backfill depth", () => {
  it("walks past the first page instead of stopping at 25", async () => {
    const listChatMessages = vi
      .fn()
      .mockResolvedValueOnce({ data: fullPage(0), next_cursor: null })
      .mockResolvedValueOnce({ data: [message(99)], next_cursor: null });
    const { interactor, messagingService, ingest } = build(listChatMessages);

    await invoke(interactor);

    expect(messagingService.listChatMessages).toHaveBeenCalledTimes(2);
    expect(ingest.ingestMessageUnscoped).toHaveBeenCalledTimes(UNIPILE_MAX_LIMIT + 1);
  });

  it("stops at the page budget so one huge chat cannot exhaust the api quota", async () => {
    const listChatMessages = vi
      .fn()
      .mockImplementation(() => Promise.resolve({ data: fullPage(0), next_cursor: null }));
    const { interactor, messagingService } = build(listChatMessages);

    await invoke(interactor);

    expect(messagingService.listChatMessages).toHaveBeenCalledTimes(BACKFILL_MESSAGE_PAGE_BUDGET);
  });

  it("stops early when the chat genuinely ends", async () => {
    const listChatMessages = vi.fn().mockResolvedValue({ data: [message(0), message(1)], next_cursor: null });
    const { interactor, messagingService } = build(listChatMessages);

    await invoke(interactor);

    expect(messagingService.listChatMessages).toHaveBeenCalledTimes(1);
  });
});
