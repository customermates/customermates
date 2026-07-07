import type * as InboxSchemaModule from "../../inbox/inbox.schema";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createMockUser } from "@/tests/helpers/mock-user";
import {
  MOCK_ENV_MODULE,
  createMockDiModule,
  MOCK_ZOD_MODULE,
  MOCK_PRISMA_DB_MODULE,
} from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);
vi.mock("next-intl/server", () => ({
  getTranslations: () => Promise.resolve((key: string) => key),
  getLocale: () => Promise.resolve("en"),
}));
vi.mock("../../inbox/inbox.schema", async (importActual) => ({
  ...(await importActual<typeof InboxSchemaModule>()),
  toMessagingMessageDto: (message: unknown) => message,
}));

import { SendEmailInteractor } from "../send-email.interactor";
import { MessagingProvider, MessagingMessageDirection } from "@/generated/prisma";

const ACCOUNT_ID = "00000000-0000-4000-8000-000000000002";
const PERSISTED_THREAD_ID = "00000000-0000-4000-8000-000000000003";

const account = {
  id: ACCOUNT_ID,
  unipileAccountId: "acc-1",
  emailAddress: "me@example.com",
  displayName: "Me",
  provider: MessagingProvider.google,
  sentFolderIds: [],
} as never;

const persistedRow = {
  id: "00000000-0000-4000-8000-000000000004",
  messagingThreadId: PERSISTED_THREAD_ID,
  connectedAccountId: ACCOUNT_ID,
  providerMessageId: null,
  provider: MessagingProvider.google,
  direction: MessagingMessageDirection.outbound,
  sender: { attendeeId: "me@example.com", displayName: "Me", identifier: "me@example.com", isSelf: true },
  recipients: { to: [], cc: [], bcc: [] },
  subject: "New",
  bodyText: null,
  bodyHtml: "<p>fresh body</p>",
  attachmentsMeta: [],
  isEvent: false,
  isDeleted: false,
  isHidden: false,
  sentAt: new Date(),
  editedAt: null,
  reactions: [],
};

const sentEmail = {
  id: "u-1",
  message_id: "provider-mid-1",
  thread_id: "t-1",
  subject: "New",
  body: "<p>fresh body</p>",
  date: "2026-07-06T10:00:00.000Z",
  from: [{ email: "me@example.com", display_name: "Me" }],
  to: [{ email: "you@example.com" }],
};

const input = {
  connectedAccountId: ACCOUNT_ID,
  to: [{ identifier: "you@example.com" }],
  subject: "New",
  body: "fresh body",
};

function makeRepo() {
  return {
    findThreadByIdOrThrow: vi.fn(),
    findLatestEmailReplyReferenceForThread: vi.fn(),
    findDraftById: vi.fn().mockResolvedValue(null),
    findRecentOutboundDuplicate: vi.fn(),
    persistOutboundMessageOrThrow: vi.fn().mockResolvedValue(persistedRow),
    convertDraftToSent: vi.fn(),
  };
}

function makeInteractor(repo: any, service: any) {
  return new SendEmailInteractor(
    repo,
    { findUsableAccountByIdOrThrow: vi.fn().mockResolvedValue(account) } as never,
    service,
  );
}

describe("SendEmailInteractor new-thread adoption", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.useRealTimers());

  it("adopts the sent email into a thread and returns its DTO", async () => {
    const service = {
      sendEmail: vi.fn().mockResolvedValue({ ok: true, data: { id: "u-1", messageId: "m-1" } }),
      getEmail: vi.fn().mockResolvedValue(sentEmail),
    };
    const repo = makeRepo();

    const result: any = await makeInteractor(repo, service).invoke(input);

    expect(result.ok).toBe(true);
    expect(result.data.messagingThreadId).toBe(PERSISTED_THREAD_ID);
    expect(service.getEmail).toHaveBeenCalledWith({ accountId: "acc-1", emailId: "u-1", timeoutMs: 5000 });
    const call = repo.persistOutboundMessageOrThrow.mock.calls[0][0];
    expect(call.connectedAccountId).toBe(ACCOUNT_ID);
    expect(call.message.unipileThreadId).toBe("t-1");
    expect(call.message.direction).toBe(MessagingMessageDirection.outbound);
  });

  it("returns null without a retry when fetching the sent email fails", async () => {
    const service = {
      sendEmail: vi.fn().mockResolvedValue({ ok: true, data: { id: "u-1", messageId: "m-1" } }),
      getEmail: vi.fn().mockRejectedValue(new Error("fetch failed")),
    };
    const repo = makeRepo();

    const result: any = await makeInteractor(repo, service).invoke(input);

    expect(result).toEqual({ ok: true, data: null });
    expect(service.getEmail).toHaveBeenCalledTimes(1);
    expect(repo.persistOutboundMessageOrThrow).not.toHaveBeenCalled();
  });

  it("returns null when the sent email does not parse", async () => {
    const service = {
      sendEmail: vi.fn().mockResolvedValue({ ok: true, data: { id: "u-1", messageId: "m-1" } }),
      getEmail: vi.fn().mockResolvedValue({ object: "Email" }),
    };
    const repo = makeRepo();

    const result: any = await makeInteractor(repo, service).invoke(input);

    expect(result).toEqual({ ok: true, data: null });
    expect(service.getEmail).toHaveBeenCalledTimes(1);
    expect(repo.persistOutboundMessageOrThrow).not.toHaveBeenCalled();
  });
});
