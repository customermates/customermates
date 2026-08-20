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
import { UNIPILE_MAX_LIMIT } from "../paginate";
import { ACCOUNT_WIDE_SOURCE } from "../prepare-backfill.interactor";

const CONNECTED_ACCOUNT_ID = "55555555-5555-4555-8555-555555555555";
const account = {
  id: "acc-1",
  companyId: "co-1",
  unipileAccountId: "acc_uni-1",
  provider: "whatsapp",
  status: "ok",
  displayName: "+4900000000",
} as never;

const groupChat = { id: "group-1@g.us", name: "Big Group", is_group: true, is_channel: false, type: "group" };

function member(i: number) {
  return { id: `member-${i}`, display_name: `Member ${i}`, public_identifier: `+4900000${String(i).padStart(3, "0")}` };
}

function build(listChatParticipants: ReturnType<typeof vi.fn>) {
  const messagingService = {
    listChats: vi.fn().mockResolvedValue({ data: [groupChat], next_cursor: null }),
    listChatMessages: vi.fn().mockResolvedValue({ data: [], next_cursor: null }),
    listChatParticipants,
  };
  const ingest = {
    upsertChatThreadUnscoped: vi.fn().mockResolvedValue({ id: "thread-1" }),
    ingestMessageUnscoped: vi.fn().mockResolvedValue({ isEcho: false, message: { id: "m1" } }),
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

beforeEach(() => vi.clearAllMocks());

describe("group roster backfill", () => {
  it("fetches the roster even though unipile never sends participants_count", async () => {
    const listChatParticipants = vi.fn().mockResolvedValue({ data: [member(0), member(1)], next_cursor: null });
    const { interactor, messagingService } = build(listChatParticipants);

    await invoke(interactor);

    expect(messagingService.listChatParticipants).toHaveBeenCalled();
  });

  it("pages past the first page so a large group is not truncated", async () => {
    const full = Array.from({ length: UNIPILE_MAX_LIMIT }, (_, i) => member(i));
    const listChatParticipants = vi
      .fn()
      .mockResolvedValueOnce({ data: full, next_cursor: "c1" })
      .mockResolvedValueOnce({ data: [member(99)], next_cursor: null });
    const { interactor, messagingService, ingest } = build(listChatParticipants);

    await invoke(interactor);

    expect(messagingService.listChatParticipants).toHaveBeenCalledTimes(2);
    const upsert = ingest.upsertChatThreadUnscoped.mock.calls[0][0];
    expect(upsert.participants).toHaveLength(UNIPILE_MAX_LIMIT + 1);
  });
});
