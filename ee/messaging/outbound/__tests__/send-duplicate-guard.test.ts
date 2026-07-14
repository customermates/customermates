import type * as InboxSchemaModule from "../../inbox/inbox.schema";

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockEntitlementService } from "@/tests/helpers/mock-entitlement-service";
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

import { SendChatMessageInteractor } from "../send-chat-message.interactor";
import { SendEmailInteractor } from "../send-email.interactor";
import { ValidateThreadIdsInteractor } from "@/core/validation/validators/validate-thread-ids.interactor";
import { getMessagingRepo } from "@/core/di";
import { MessagingProvider, MessagingThreadType } from "@/generated/prisma";

const THREAD_ID = "00000000-0000-4000-8000-000000000001";
const ACCOUNT_ID = "00000000-0000-4000-8000-000000000002";
const DUPLICATE_KEY = "Common.errors.duplicateOutboundSuppressed";

const thread = {
  id: THREAD_ID,
  connectedAccountId: ACCOUNT_ID,
  unipileThreadId: "chat-1",
  provider: MessagingProvider.whatsapp,
  type: MessagingThreadType.single,
} as never;

const account = {
  id: ACCOUNT_ID,
  unipileAccountId: "acc-1",
  emailAddress: "me@example.com",
  displayName: "Me",
} as never;

function makeChatInteractor(repo: any, service: any) {
  return new SendChatMessageInteractor(
    repo,
    { findUsableAccountByIdOrThrow: vi.fn().mockResolvedValue(account) } as never,
    service,
    new ValidateThreadIdsInteractor(getMessagingRepo()),
    mockEntitlementService(),
  );
}

function makeEmailInteractor(repo: any, service: any) {
  return new SendEmailInteractor(
    repo,
    { findUsableAccountByIdOrThrow: vi.fn().mockResolvedValue(account) } as never,
    service,
    mockEntitlementService(),
  );
}

describe("SendChatMessageInteractor duplicate guard", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects an identical recent outbound send with duplicateOutboundSuppressed and never calls the provider", async () => {
    const service = { sendChatMessage: vi.fn() };
    const repo = {
      findThreadByIdOrThrow: vi.fn().mockResolvedValue(thread),
      findDraftById: vi.fn().mockResolvedValue(null),
      findRecentOutboundDuplicate: vi.fn().mockResolvedValue("dup-1"),
      findSelfAttendeeForThread: vi.fn(),
      persistOutboundMessageOrThrow: vi.fn(),
    };

    const result: any = await makeChatInteractor(repo, service).invoke({ threadId: THREAD_ID, text: "hello there" });

    expect(result.ok).toBe(false);
    expect(result.error.issues.some((issue: any) => issue.message === DUPLICATE_KEY)).toBe(true);
    expect(service.sendChatMessage).not.toHaveBeenCalled();
  });

  it("proceeds to the provider when no recent duplicate exists", async () => {
    const service = { sendChatMessage: vi.fn().mockResolvedValue({ ok: true, data: { messageId: "m-1" } }) };
    const repo = {
      findThreadByIdOrThrow: vi.fn().mockResolvedValue(thread),
      findDraftById: vi.fn().mockResolvedValue(null),
      findRecentOutboundDuplicate: vi.fn().mockResolvedValue(null),
      findSelfAttendeeForThread: vi.fn().mockResolvedValue(null),
      persistOutboundMessageOrThrow: vi.fn().mockResolvedValue({ id: "new-1", attachmentsMeta: [] }),
    };

    const result: any = await makeChatInteractor(repo, service).invoke({ threadId: THREAD_ID, text: "hello there" });

    expect(result.ok).toBe(true);
    expect(service.sendChatMessage).toHaveBeenCalledTimes(1);
    expect(repo.findRecentOutboundDuplicate).toHaveBeenCalledWith({
      messagingThreadId: THREAD_ID,
      bodyText: "hello there",
      windowMs: 60_000,
    });
  });
});

describe("SendEmailInteractor duplicate guard", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects an identical recent reply into a thread and never calls the provider", async () => {
    const service = { sendEmail: vi.fn() };
    const repo = {
      findThreadByIdOrThrow: vi.fn().mockResolvedValue({ ...(thread as object), provider: MessagingProvider.google }),
      findLatestEmailReplyReferenceForThread: vi.fn().mockResolvedValue(null),
      findDraftById: vi.fn().mockResolvedValue(null),
      findRecentOutboundDuplicate: vi.fn().mockResolvedValue("dup-1"),
      persistOutboundMessageOrThrow: vi.fn(),
    };

    const result: any = await makeEmailInteractor(repo, service).invoke({
      threadId: THREAD_ID,
      to: [{ identifier: "you@example.com" }],
      subject: "Re: hi",
      body: "same body",
    });

    expect(result.ok).toBe(false);
    expect(result.error.issues.some((issue: any) => issue.message === DUPLICATE_KEY)).toBe(true);
    expect(service.sendEmail).not.toHaveBeenCalled();
  });

  it("does not run the guard for a new-email compose without a thread", async () => {
    const service = {
      sendEmail: vi.fn().mockResolvedValue({ ok: true, data: { id: "u-1", messageId: "m-1" } }),
      getEmail: vi.fn().mockResolvedValue({}),
    };
    const repo = {
      findThreadByIdOrThrow: vi.fn(),
      findLatestEmailReplyReferenceForThread: vi.fn(),
      findDraftById: vi.fn().mockResolvedValue(null),
      findRecentOutboundDuplicate: vi.fn(),
      persistOutboundMessageOrThrow: vi.fn(),
    };

    const result: any = await makeEmailInteractor(repo, service).invoke({
      connectedAccountId: ACCOUNT_ID,
      to: [{ identifier: "you@example.com" }],
      subject: "New",
      body: "fresh body",
    });

    expect(result.ok).toBe(true);
    expect(repo.findRecentOutboundDuplicate).not.toHaveBeenCalled();
    expect(service.sendEmail).toHaveBeenCalledTimes(1);
  });
});
