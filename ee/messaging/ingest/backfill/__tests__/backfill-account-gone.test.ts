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
vi.mock("@/core/observability/server", () => ({ captureException: vi.fn(), captureMessage: vi.fn() }));

import * as ErrorReporter from "@/core/observability/server";
import { BackfillEmailsInteractor } from "../backfill-emails.interactor";
import { BackfillChatsInteractor } from "../backfill-chats.interactor";
import { ACCOUNT_WIDE_SOURCE } from "../prepare-backfill.interactor";

const CONNECTED_ACCOUNT_ID = "22222222-2222-4222-8222-222222222222";
const page = { connectedAccountId: CONNECTED_ACCOUNT_ID, source: ACCOUNT_WIDE_SOURCE, cursor: null };

const emailAccount = {
  id: CONNECTED_ACCOUNT_ID,
  companyId: "co-1",
  unipileAccountId: "acc_uni-1",
  provider: "google",
  status: "ok",
  emailAddress: "me@ex.com",
  sentFolderIds: [],
} as any;

const chatAccount = { ...emailAccount, provider: "whatsapp", displayName: null };

function email(id: string) {
  return {
    id,
    thread_id: `th-${id}`,
    date: "2026-07-08T10:00:00.000Z",
    subject: "Hi",
    from: [{ email: "sender@ex.com" }],
    to: [{ email: "me@ex.com" }],
  };
}

function chat(id: string) {
  return {
    object: "Chat",
    id,
    name: null,
    is_group: false,
    user: { id: `u-${id}`, display_name: "Bob" },
    last_message: { text: "hi", is_sender: false },
    last_message_timestamp: "2025-06-01T00:00:00.000Z",
  };
}

function foreignKeyViolation() {
  return Object.assign(
    new Error("Invalid prisma.messagingThread.upsert() invocation: MessagingThread_connectedAccountId_fkey"),
    { code: "P2003" },
  );
}

function repoFor(account: unknown) {
  return {
    findAccountByIdUnscoped: vi.fn().mockResolvedValue(account),
    recordUnusableItemUnscoped: vi.fn().mockResolvedValue(undefined),
  };
}

const noAvatars = () => ({ synchronize: () => Promise.resolve() });

beforeEach(() => vi.clearAllMocks());

describe("email backfill when the connected account is deleted mid-page", () => {
  function build() {
    const messagingService = {
      listEmails: vi.fn().mockResolvedValue({ data: [email("em-1"), email("em-2")], next_cursor: null }),
    };
    const ingest = { ingestMessageUnscoped: vi.fn().mockRejectedValue(foreignKeyViolation()) };
    const repo = repoFor(emailAccount);
    const interactor = new BackfillEmailsInteractor(
      repo as any,
      messagingService as any,
      ingest as any,
      noAvatars as any,
    );

    return { interactor, ingest, repo };
  }

  it("stops the page without reporting an error once the account row is gone", async () => {
    const { interactor, ingest, repo } = build();
    repo.findAccountByIdUnscoped.mockResolvedValueOnce(emailAccount).mockResolvedValue(null);

    const result = await interactor.invoke(page as any);

    expect(result).toEqual({ nextCursor: null, done: true, complete: false });
    expect(ingest.ingestMessageUnscoped).toHaveBeenCalledOnce();
    expect(ErrorReporter.captureException).not.toHaveBeenCalled();
    expect(repo.recordUnusableItemUnscoped).not.toHaveBeenCalled();
  });

  it("still reports a foreign key failure while the account exists", async () => {
    const { interactor, repo } = build();

    const result = await interactor.invoke(page as any);

    expect(result.complete).toBe(true);
    expect(ErrorReporter.captureException).toHaveBeenCalledTimes(2);
    expect(repo.recordUnusableItemUnscoped).toHaveBeenCalledTimes(2);
  });
});

describe("chat backfill when the connected account is deleted mid-page", () => {
  it("stops the page without reporting an error once the account row is gone", async () => {
    const messagingService = {
      listChats: vi.fn().mockResolvedValue({ data: [chat("c1"), chat("c2")], next_cursor: null }),
      listChatMessages: vi.fn().mockResolvedValue({ data: [], next_cursor: null }),
    };
    const ingest = {
      upsertChatThreadUnscoped: vi.fn().mockRejectedValue(foreignKeyViolation()),
      findThreadLatestMessageAtUnscoped: vi.fn().mockResolvedValue(null),
    };
    const repo = repoFor(chatAccount);
    repo.findAccountByIdUnscoped.mockResolvedValueOnce(chatAccount).mockResolvedValue(null);
    const interactor = new BackfillChatsInteractor(
      repo as any,
      messagingService as any,
      ingest as any,
      noAvatars as any,
    );

    const result = await interactor.invoke(page as any);

    expect(result).toEqual({ nextCursor: null, done: true, complete: false });
    expect(ingest.upsertChatThreadUnscoped).toHaveBeenCalledOnce();
    expect(ErrorReporter.captureException).not.toHaveBeenCalled();
    expect(repo.recordUnusableItemUnscoped).not.toHaveBeenCalled();
  });
});
