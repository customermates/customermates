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
import { ACCOUNT_WIDE_SOURCE } from "../prepare-backfill.interactor";

const CONNECTED_ACCOUNT_ID = "11111111-1111-4111-8111-111111111111";
const account = {
  id: "acc-1",
  companyId: "co-1",
  unipileAccountId: "acc_uni-1",
  provider: "whatsapp",
  status: "ok",
  displayName: null,
} as any;

function build(overrides: { chats?: unknown[]; participants?: unknown[] }) {
  const messagingService = {
    listChats: vi.fn().mockResolvedValue({ data: overrides.chats ?? [], next_cursor: null }),
    listInboxChats: vi.fn().mockResolvedValue({ data: overrides.chats ?? [], next_cursor: null }),
    listChatParticipants: vi.fn().mockResolvedValue({ data: overrides.participants ?? [], next_cursor: null }),
    listChatMessages: vi.fn().mockResolvedValue({ data: [], next_cursor: null }),
  };
  const ingest = {
    upsertChatThreadUnscoped: vi.fn().mockResolvedValue({ id: "thread-row-1" }),
    ingestMessageUnscoped: vi.fn().mockResolvedValue(undefined),
    findThreadBackfillStateUnscoped: vi.fn().mockResolvedValue(null),
  };
  const repo = {
    findAccountByIdUnscoped: vi.fn().mockResolvedValue(account),
    recordUnusableItemUnscoped: vi.fn().mockResolvedValue(undefined),
    recordRawBackfillItemUnscoped: vi.fn().mockResolvedValue(undefined),
  };
  const interactor = new BackfillChatsInteractor(repo as any, messagingService as any, ingest as any);

  return { interactor, messagingService, ingest, repo };
}

const accountWide = { connectedAccountId: CONNECTED_ACCOUNT_ID, source: ACCOUNT_WIDE_SOURCE, cursor: null };

const groupChat = {
  object: "Chat",
  id: "c1",
  name: "Group",
  description: "a group chat",
  is_group: true,
  participants_count: 1,
  participants: [
    { object: "GroupParticipant", is_self: true, user: { id: "self", display_name: "Me" } },
    { object: "GroupParticipant", is_self: false, user: { id: "a1", display_name: "Bob" } },
  ],
  unread_count: 2,
  last_message: { text: "hi there", is_sender: false },
  last_message_timestamp: "2025-06-01T00:00:00.000Z",
};

describe("BackfillChatsInteractor (list-only page)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists the account-wide page, upserts one thread per chat, and reports exhaustion", async () => {
    const { interactor, messagingService, ingest } = build({ chats: [groupChat] });

    const result = await interactor.invoke(accountWide as any);

    expect(messagingService.listChats).toHaveBeenCalledTimes(1);
    expect(messagingService.listInboxChats).not.toHaveBeenCalled();
    expect(messagingService.listChatParticipants).not.toHaveBeenCalled();
    expect(ingest.upsertChatThreadUnscoped).toHaveBeenCalledTimes(1);

    const args = ingest.upsertChatThreadUnscoped.mock.calls[0][0];
    expect(args.type).toBe("group");
    expect(args.name).toBe("Group");
    expect(args.subject).toBe("a group chat");
    expect(args.participants).toHaveLength(1);
    expect(args.participants[0].displayName).toBe("Bob");
    expect(args.lastMessagePreview).toBe("hi there");
    expect(args.lastMessageIsSender).toBe(false);
    expect(args.lastMessageAt).toEqual(new Date("2025-06-01T00:00:00.000Z"));

    expect(result).toEqual({ nextCursor: null, done: true });
  });

  it("withholds thread pointers when the chat's last_message has no text", async () => {
    const { interactor, ingest } = build({
      chats: [{ ...groupChat, id: "c3", last_message: { text: "  ", is_sender: true } }],
    });

    await interactor.invoke(accountWide as any);

    const args = ingest.upsertChatThreadUnscoped.mock.calls[0][0];
    expect(args.lastMessageAt).toBeUndefined();
    expect(args.lastMessagePreview).toBeUndefined();
    expect(args.lastMessageIsSender).toBeUndefined();
  });

  it("fetches participants when the group roster is empty but participants_count > 0", async () => {
    const { interactor, messagingService, ingest } = build({
      chats: [
        { object: "Chat", id: "c2", name: "Empty Group", is_group: true, participants_count: 2, participants: [] },
      ],
      participants: [{ id: "p1", display_name: "Alice" }],
    });

    await interactor.invoke(accountWide as any);

    expect(messagingService.listChatParticipants).toHaveBeenCalledTimes(1);
    expect(messagingService.listChatParticipants.mock.calls[0][0].chatId).toBe("c2");

    const args = ingest.upsertChatThreadUnscoped.mock.calls[0][0];
    expect(args.participants).toHaveLength(1);
    expect(args.participants[0].displayName).toBe("Alice");
  });

  it("lists a LinkedIn inbox source via listInboxChats, honoring the incoming cursor", async () => {
    const { interactor, messagingService } = build({ chats: [groupChat] });

    await interactor.invoke({ connectedAccountId: CONNECTED_ACCOUNT_ID, source: "inbox-7", cursor: "c:cur-42" } as any);

    expect(messagingService.listChats).not.toHaveBeenCalled();
    expect(messagingService.listInboxChats).toHaveBeenCalledTimes(1);
    const call = messagingService.listInboxChats.mock.calls[0][0];
    expect(call.inboxId).toBe("inbox-7");
    expect(call.cursor).toBe("cur-42");
  });
});
