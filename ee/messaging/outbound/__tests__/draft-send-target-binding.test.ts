import type * as InboxSchemaModule from "../../inbox/inbox.schema";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { mockEntitlementService } from "@/tests/helpers/mock-entitlement-service";
import { MOCK_DRAFT_SEND_CLAIM_ID, mockDraftSendRepo } from "@/tests/helpers/mock-draft-send-repo";
import { createMockUser } from "@/tests/helpers/mock-user";
import {
  MOCK_ENV_MODULE,
  MOCK_PRISMA_DB_MODULE,
  MOCK_ZOD_MODULE,
  createMockDiModule,
} from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);
vi.mock("next-intl/server", () => ({
  getTranslations: (namespace?: string) => {
    const t = (key: string) => (namespace ? `${namespace}.${key}` : key);
    return Promise.resolve(Object.assign(t, { raw: t }));
  },
  getLocale: () => Promise.resolve("en"),
}));
vi.mock("../../inbox/inbox.schema", async (importActual) => ({
  ...(await importActual<typeof InboxSchemaModule>()),
  toMessagingMessageDto: (message: unknown) => message,
}));

import { CustomErrorCode } from "@/core/validation/validation.types";
import { MessagingMessageDirection, MessagingProvider, MessagingThreadType } from "@/generated/prisma";

import { draftThreadRecipientSetsMatch } from "../../draft-thread";
import { newDraftThreadProviderId } from "../../draft-thread-id";
import { SaveDraftInteractor } from "../save-draft.interactor";
import { SendEmailInteractor } from "../send-email.interactor";
import { StartChatInteractor } from "../start-chat.interactor";
import { DiscardDraftInteractor } from "../discard-draft.interactor";

const EMAIL_ACCOUNT_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_ACCOUNT_ID = "00000000-0000-4000-8000-000000000002";
const REPLY_THREAD_ID = "00000000-0000-4000-8000-000000000003";
const OTHER_THREAD_ID = "00000000-0000-4000-8000-000000000004";
const EMAIL_DRAFT_THREAD_ID = "00000000-0000-4000-8000-000000000005";
const EMAIL_DRAFT_ID = "00000000-0000-4000-8000-000000000006";

const EMAIL_RECIPIENT = "recipient@example.com";
const DRAFT_REVISION = "2026-09-04T09:59:00.000Z";
const DRAFT_UPDATED_AT = new Date(DRAFT_REVISION);
const CLAIM = { id: MOCK_DRAFT_SEND_CLAIM_ID, draftRevision: DRAFT_UPDATED_AT };

const CHAT_ACCOUNT_ID = "00000000-0000-4000-8000-000000000011";
const CHAT_DRAFT_THREAD_ID = "00000000-0000-4000-8000-000000000012";
const CHAT_DRAFT_ID = "00000000-0000-4000-8000-000000000013";
const PERSISTED_CHAT_THREAD_ID = "00000000-0000-4000-8000-000000000014";
const PERSISTED_CHAT_MESSAGE_ID = "00000000-0000-4000-8000-000000000015";
const WHATSAPP_NUMBER = "+49 176 56945421";

const NORMALIZED_WHATSAPP_NUMBER = "+4917656945421";

const emailAccount = {
  id: EMAIL_ACCOUNT_ID,
  unipileAccountId: "email-account",
  emailAddress: "sender@example.com",
  displayName: "Sender",
  provider: MessagingProvider.google,
  sentFolderIds: [],
  signature: null,
  signatureFields: null,
} as never;

const emailReplyThread = {
  id: REPLY_THREAD_ID,
  connectedAccountId: EMAIL_ACCOUNT_ID,
  unipileThreadId: "email-thread",
  provider: MessagingProvider.google,
  type: MessagingThreadType.single,
} as never;

const emailDraft = {
  id: EMAIL_DRAFT_ID,
  messagingThreadId: EMAIL_DRAFT_THREAD_ID,
  connectedAccountId: EMAIL_ACCOUNT_ID,
  unipileThreadId: "draft_legacy-email-shell",
  recipientIdentifiers: [EMAIL_RECIPIENT],
  updatedAt: DRAFT_UPDATED_AT,
};

const persistedEmail = {
  id: "00000000-0000-4000-8000-000000000007",
  messagingThreadId: "00000000-0000-4000-8000-000000000008",
  connectedAccountId: EMAIL_ACCOUNT_ID,
  providerMessageId: "provider-email",
  provider: MessagingProvider.google,
  direction: MessagingMessageDirection.outbound,
  sender: {
    attendeeId: "sender@example.com",
    displayName: "Sender",
    identifier: "sender@example.com",
    isSelf: true,
  },
  recipients: { to: [], cc: [], bcc: [] },
  subject: "Cold email",
  bodyText: "Hello",
  bodyHtml: "Hello",
  attachmentsMeta: [],
  isEvent: false,
  isDeleted: false,
  isHidden: false,
  sentAt: new Date("2026-09-04T10:00:00.000Z"),
  editedAt: null,
  reactions: [],
  draftRevision: null,
};

const sentEmail = {
  id: "unipile-email",
  message_id: "provider-email",
  thread_id: "provider-thread",
  subject: "Cold email",
  body: "Hello",
  date: "2026-09-04T10:00:00.000Z",
  from: [{ email: "sender@example.com", display_name: "Sender" }],
  to: [{ email: "recipient@example.com" }],
};

const coldEmailInput = {
  connectedAccountId: EMAIL_ACCOUNT_ID,
  draftMessageId: EMAIL_DRAFT_ID,
  draftRevision: DRAFT_REVISION,
  to: [{ identifier: EMAIL_RECIPIENT }],
  subject: "Cold email",
  body: "Hello",
};

function emailRepo(overrides: Record<string, unknown> = {}) {
  return {
    findThreadByIdOrThrow: vi.fn().mockResolvedValue(emailReplyThread),
    findThreadById: vi.fn().mockResolvedValue(emailReplyThread),
    findLatestEmailReplyReferenceForThread: vi.fn().mockResolvedValue(null),
    findDraftById: vi.fn().mockResolvedValue(emailDraft),
    findRecentOutboundDuplicate: vi.fn().mockResolvedValue(null),
    persistOutboundMessageOrThrow: vi.fn().mockResolvedValue(persistedEmail),
    completeReplyDraftSend: vi.fn().mockResolvedValue(null),
    restoreDraftSummaryIfPresent: vi.fn().mockResolvedValue(undefined),
    ...mockDraftSendRepo(),
    ...overrides,
  };
}

function emailInteractor(repo: any, service: any) {
  return new SendEmailInteractor(
    repo,
    {
      findUsableAccountByIdOrThrow: vi.fn().mockResolvedValue(emailAccount),
    } as never,
    service,
    mockEntitlementService(),
  );
}

function emailService() {
  return {
    sendEmail: vi.fn().mockResolvedValue({
      ok: true,
      data: { id: "unipile-email", messageId: "provider-email" },
    }),
    getEmail: vi.fn().mockResolvedValue(sentEmail),
  };
}

function expectDraftConflict(result: any, code: CustomErrorCode) {
  expect(result.ok).toBe(false);
  expect(result.error.issues).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        params: expect.objectContaining({ error: code, kind: "conflict" }),
      }),
    ]),
  );
}

describe("SendEmailInteractor draft target binding", () => {
  beforeEach(() => vi.clearAllMocks());

  it("delivers a saved Bcc-only cold draft with an empty public To list", async () => {
    const repo = emailRepo({
      findDraftById: vi.fn().mockResolvedValue({
        ...emailDraft,
        recipientIdentifiers: [],
        ccIdentifiers: [],
        bccIdentifiers: ["hidden@example.com"],
      }),
    });
    const service = emailService();
    service.getEmail.mockResolvedValue({ ...sentEmail, to: [], bcc: [{ email: "hidden@example.com" }] });
    const result = await emailInteractor(repo, service).invoke({
      ...coldEmailInput,
      to: [],
      bcc: ["hidden@example.com"],
    });
    expect(result.ok).toBe(true);
    expect(service.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: [],
        bcc: [{ email: "hidden@example.com" }],
      }),
    );
  });

  it.each([
    { to: [], bcc: ["other@example.com"] },
    { to: [], cc: ["copy@example.com"], bcc: ["hidden@example.com"] },
    { to: [], cc: ["copy@example.com"] },
  ])("sends a To-less draft after its Cc or Bcc recipients were edited: %j", async (groups) => {
    const repo = emailRepo({
      findDraftById: vi.fn().mockResolvedValue({
        ...emailDraft,
        recipientIdentifiers: [],
        ccIdentifiers: [],
        bccIdentifiers: ["hidden@example.com"],
      }),
    });
    const service = emailService();
    const result = await emailInteractor(repo, service).invoke({ ...coldEmailInput, ...groups });
    expect(result.ok).toBe(true);
    expect(service.sendEmail).toHaveBeenCalledOnce();
    expect(repo.completeDraftSendRemovingDraft).toHaveBeenCalledOnce();
  });

  it.each([{ to: [], cc: ["Hidden@Example.com"] }, { to: [{ identifier: "hidden@example.com" }] }])(
    "refuses to move a saved Bcc recipient into To or Cc: %j",
    async (groups) => {
      const repo = emailRepo({
        findDraftById: vi.fn().mockResolvedValue({
          ...emailDraft,
          recipientIdentifiers: [],
          ccIdentifiers: [],
          bccIdentifiers: ["hidden@example.com"],
        }),
      });
      const service = emailService();
      const result = await emailInteractor(repo, service).invoke({ ...coldEmailInput, ...groups });
      expectDraftConflict(result, CustomErrorCode.draftRecipientsChanged);
      expect(service.sendEmail).not.toHaveBeenCalled();
      expect(repo.beginDraftSend).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["another account", { connectedAccountId: OTHER_ACCOUNT_ID, unipileThreadId: "draft_email" }],
    ["a real provider thread", { connectedAccountId: EMAIL_ACCOUNT_ID, unipileThreadId: "email-thread" }],
  ])("rejects a cold draft bound to %s before provider send", async (_label, mismatch) => {
    const repo = emailRepo({
      findDraftById: vi.fn().mockResolvedValue({ ...emailDraft, ...mismatch }),
    });
    const service = emailService();

    const result = await emailInteractor(repo, service).invoke(coldEmailInput);

    expectDraftConflict(result, CustomErrorCode.draftTargetMismatch);
    expect(service.sendEmail).not.toHaveBeenCalled();
    expect(service.getEmail).not.toHaveBeenCalled();
    expect(repo.beginDraftSend).not.toHaveBeenCalled();
  });

  it("rejects a reply draft bound to another thread before provider send", async () => {
    const repo = emailRepo({
      findDraftById: vi.fn().mockResolvedValue({
        ...emailDraft,
        messagingThreadId: OTHER_THREAD_ID,
        unipileThreadId: "email-thread",
      }),
    });
    const service = emailService();

    const result = await emailInteractor(repo, service).invoke({
      ...coldEmailInput,
      connectedAccountId: undefined,
      threadId: REPLY_THREAD_ID,
    });

    expectDraftConflict(result, CustomErrorCode.draftTargetMismatch);
    expect(service.sendEmail).not.toHaveBeenCalled();
    expect(repo.completeReplyDraftSend).not.toHaveBeenCalled();
  });

  it("rejects a same-account cold draft when the send targets another recipient", async () => {
    const repo = emailRepo();
    const service = emailService();

    const result = await emailInteractor(repo, service).invoke({
      ...coldEmailInput,
      to: [{ identifier: "another@example.com" }],
    });

    expectDraftConflict(result, CustomErrorCode.draftRecipientsChanged);
    expect(service.sendEmail).not.toHaveBeenCalled();
    expect(service.getEmail).not.toHaveBeenCalled();
    expect(repo.beginDraftSend).not.toHaveBeenCalled();
  });

  it("accepts a same-account cold draft after email target normalization", async () => {
    const repo = emailRepo();
    const service = emailService();

    const result = await emailInteractor(repo, service).invoke({
      ...coldEmailInput,
      to: [{ identifier: "Recipient@Example.com" }],
    });

    expect(result.ok).toBe(true);
    expect(service.sendEmail).toHaveBeenCalledTimes(1);
    expect(repo.completeDraftSendRemovingDraft).toHaveBeenCalledWith({
      claim: CLAIM,
      draftMessageId: EMAIL_DRAFT_ID,
      unipileMessageId: "unipile-email",
      providerMessageId: "provider-email",
    });
  });

  it("claims the revision before sending and settles it with the draft before adopting the sent copy", async () => {
    const repo = emailRepo();
    const service = emailService();

    const result = await emailInteractor(repo, service).invoke(coldEmailInput);

    expect(result.ok).toBe(true);
    expect(repo.beginDraftSend).toHaveBeenCalledWith({
      draftMessageId: EMAIL_DRAFT_ID,
      draftRevision: DRAFT_UPDATED_AT,
      connectedAccountId: EMAIL_ACCOUNT_ID,
    });
    expect(service.getEmail).toHaveBeenCalledWith({
      accountId: "email-account",
      emailId: "unipile-email",
      timeoutMs: 5000,
    });
    expect(repo.persistOutboundMessageOrThrow).toHaveBeenCalledTimes(1);
    expect(repo.recordDraftSendResult).toHaveBeenCalledWith({
      claim: CLAIM,
      sentMessageId: persistedEmail.id,
      sentThreadId: persistedEmail.messagingThreadId,
    });
    expect(repo.beginDraftSend.mock.invocationCallOrder[0]).toBeLessThan(service.sendEmail.mock.invocationCallOrder[0]);
    expect(service.sendEmail.mock.invocationCallOrder[0]).toBeLessThan(
      repo.completeDraftSendRemovingDraft.mock.invocationCallOrder[0],
    );
    expect(repo.completeDraftSendRemovingDraft.mock.invocationCallOrder[0]).toBeLessThan(
      service.getEmail.mock.invocationCallOrder[0],
    );
  });

  it("still discards a delivered cold draft when provider adoption cannot resolve it", async () => {
    const repo = emailRepo();
    const service = {
      ...emailService(),
      getEmail: vi.fn().mockRejectedValue(new Error("not indexed yet")),
    };

    const result = await emailInteractor(repo, service).invoke(coldEmailInput);

    expect(result).toEqual({
      ok: true,
      data: { message: null, messageId: null, threadId: null, providerMessageId: "provider-email", repeated: false },
    });
    expect(repo.persistOutboundMessageOrThrow).not.toHaveBeenCalled();
    expect(repo.completeDraftSendRemovingDraft).toHaveBeenCalledWith(
      expect.objectContaining({ claim: CLAIM, draftMessageId: EMAIL_DRAFT_ID }),
    );
  });

  it("reports a delivered cold send as sent and still settles the claim when its draft shell cannot be discarded", async () => {
    const repo = emailRepo({
      completeDraftSendRemovingDraft: vi.fn().mockRejectedValue(new Error("database unavailable")),
    });
    const service = emailService();

    const result = await emailInteractor(repo, service).invoke(coldEmailInput);

    expect(result.ok).toBe(true);
    expect(service.sendEmail).toHaveBeenCalledTimes(1);
    expect(repo.settleDraftSend).toHaveBeenCalledWith({
      claim: CLAIM,
      state: "sent",
      unipileMessageId: "unipile-email",
      providerMessageId: "provider-email",
    });
  });

  it("reports draftMessageNotFound only when the draft is gone and was never sent", async () => {
    const repo = emailRepo({ findDraftById: vi.fn().mockResolvedValue(null) });
    const service = emailService();

    const result: any = await emailInteractor(repo, service).invoke(coldEmailInput);

    expect(result.ok).toBe(false);
    expect(result.error.issues[0].params).toEqual(
      expect.objectContaining({ error: CustomErrorCode.draftMessageNotFound, kind: "not_found" }),
    );
    expect(repo.findDraftSend).toHaveBeenCalledWith({ draftMessageId: EMAIL_DRAFT_ID });
    expect(service.sendEmail).not.toHaveBeenCalled();
  });

  it("replays the first result for a draft that was already sent with this revision", async () => {
    const record = {
      id: MOCK_DRAFT_SEND_CLAIM_ID,
      draftMessageId: EMAIL_DRAFT_ID,
      draftRevision: DRAFT_UPDATED_AT,
      connectedAccountId: EMAIL_ACCOUNT_ID,
      state: "sent",
      unipileMessageId: "unipile-email",
      providerMessageId: "provider-email",
      sentMessageId: persistedEmail.id,
      sentThreadId: persistedEmail.messagingThreadId,
      updatedAt: new Date(),
    };
    const repo = emailRepo({
      findDraftById: vi.fn().mockResolvedValue(null),
      findDraftSend: vi.fn().mockResolvedValue(record),
      findDraftSendMessage: vi.fn().mockResolvedValue(persistedEmail),
    });
    const service = emailService();

    const result: any = await emailInteractor(repo, service).invoke(coldEmailInput);

    expect(result.ok).toBe(true);
    expect(result.data).toMatchObject({
      messageId: persistedEmail.id,
      threadId: persistedEmail.messagingThreadId,
      providerMessageId: "provider-email",
      repeated: true,
    });
    expect(service.sendEmail).not.toHaveBeenCalled();
  });

  it("reports a stale client revision as a changed draft before provider send", async () => {
    const repo = emailRepo();
    const service = emailService();

    const result = await emailInteractor(repo, service).invoke({
      ...coldEmailInput,
      draftRevision: "2026-09-04T09:58:00.000Z",
    });

    expectDraftConflict(result, CustomErrorCode.draftChanged);
    expect(service.sendEmail).not.toHaveBeenCalled();
    expect(repo.beginDraftSend).not.toHaveBeenCalled();
  });

  it("passes the client-observed revision into reply-draft conversion", async () => {
    const repo = emailRepo({
      findDraftById: vi.fn().mockResolvedValue({
        ...emailDraft,
        messagingThreadId: REPLY_THREAD_ID,
        unipileThreadId: "email-thread",
      }),
      completeReplyDraftSend: vi.fn().mockResolvedValue(persistedEmail),
    });
    const service = emailService();

    const result = await emailInteractor(repo, service).invoke({
      ...coldEmailInput,
      connectedAccountId: undefined,
      threadId: REPLY_THREAD_ID,
    });

    expect(result.ok).toBe(true);
    expect(repo.completeReplyDraftSend).toHaveBeenCalledWith(
      expect.objectContaining({
        claim: CLAIM,
        messageId: EMAIL_DRAFT_ID,
      }),
    );
    expect(repo.persistOutboundMessageOrThrow).not.toHaveBeenCalled();
  });
});

const chatAccount = {
  id: CHAT_ACCOUNT_ID,
  unipileAccountId: "chat-account",
  provider: MessagingProvider.whatsapp,
  displayName: "Sender",
  linkedinProducts: [],
} as never;

const chatDraft = {
  id: CHAT_DRAFT_ID,
  messagingThreadId: CHAT_DRAFT_THREAD_ID,
  connectedAccountId: CHAT_ACCOUNT_ID,
  unipileThreadId: "draft_legacy-chat-shell",
  recipientIdentifiers: [NORMALIZED_WHATSAPP_NUMBER],
  updatedAt: DRAFT_UPDATED_AT,
};

const coldChatInput = {
  connectedAccountId: CHAT_ACCOUNT_ID,
  attendeeIdentifiers: [WHATSAPP_NUMBER],
  text: "Hello",
  draftMessageId: CHAT_DRAFT_ID,
  draftRevision: DRAFT_REVISION,
};

function chatRepo(overrides: Record<string, unknown> = {}) {
  return {
    findDraftById: vi.fn().mockResolvedValue(chatDraft),
    persistOutboundMessageOrThrow: vi
      .fn()
      .mockResolvedValue({ id: PERSISTED_CHAT_MESSAGE_ID, messagingThreadId: PERSISTED_CHAT_THREAD_ID }),
    ...mockDraftSendRepo(),
    ...overrides,
  };
}

function chatService(
  result: unknown = {
    ok: true,
    data: { chatId: "provider-chat", messageId: "provider-message" },
  },
) {
  return { listInboxes: vi.fn(), startChat: vi.fn().mockResolvedValue(result) };
}

function chatInteractor(repo: any, service: any, account: unknown = chatAccount) {
  return new StartChatInteractor(
    {
      findUsableAccountByIdOrThrow: vi.fn().mockResolvedValue(account),
    } as never,
    {
      findIdentityChannelsCompanyWide: vi.fn().mockResolvedValue([]),
      findIdentityCompanyWide: vi.fn(),
      isRecordWritePaused: vi.fn(),
      isRecordEditableCompanyWide: vi.fn(),
      setIdentityResolutionCompanyWide: vi.fn(),
    } as never,
    service,
    repo,
    mockEntitlementService(),
    { resolve: vi.fn().mockResolvedValue([]) } as never,
  );
}

describe("StartChatInteractor cold-draft target binding", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ["another account", { connectedAccountId: OTHER_ACCOUNT_ID, unipileThreadId: "draft_chat" }],
    ["a real provider thread", { connectedAccountId: CHAT_ACCOUNT_ID, unipileThreadId: "provider-chat" }],
  ])("rejects a cold chat draft bound to %s before provider send", async (_label, mismatch) => {
    const repo = chatRepo({
      findDraftById: vi.fn().mockResolvedValue({ ...chatDraft, ...mismatch }),
    });
    const service = chatService();

    const result = await chatInteractor(repo, service).invoke(coldChatInput);

    expectDraftConflict(result, CustomErrorCode.draftTargetMismatch);
    expect(service.startChat).not.toHaveBeenCalled();
    expect(repo.persistOutboundMessageOrThrow).not.toHaveBeenCalled();
    expect(repo.beginDraftSend).not.toHaveBeenCalled();
  });

  it("normalizes a matching phone target, claims the revision and settles it with the draft after the send", async () => {
    const repo = chatRepo();
    const service = chatService();

    const result = await chatInteractor(repo, service).invoke(coldChatInput);

    expect(result).toEqual({
      ok: true,
      data: { threadId: PERSISTED_CHAT_THREAD_ID, messageId: PERSISTED_CHAT_MESSAGE_ID, repeated: false },
    });
    expect(repo.completeDraftSendRemovingDraft).toHaveBeenCalledWith({
      claim: CLAIM,
      draftMessageId: CHAT_DRAFT_ID,
      unipileMessageId: "provider-message",
      providerMessageId: null,
    });
    expect(repo.beginDraftSend.mock.invocationCallOrder[0]).toBeLessThan(service.startChat.mock.invocationCallOrder[0]);
    expect(service.startChat.mock.invocationCallOrder[0]).toBeLessThan(
      repo.completeDraftSendRemovingDraft.mock.invocationCallOrder[0],
    );
    expect(repo.recordDraftSendResult).toHaveBeenCalledWith({
      claim: CLAIM,
      sentMessageId: PERSISTED_CHAT_MESSAGE_ID,
      sentThreadId: PERSISTED_CHAT_THREAD_ID,
    });
  });

  it("reports a delivered cold chat as sent and still settles the claim when its draft shell cannot be discarded", async () => {
    const repo = chatRepo({
      completeDraftSendRemovingDraft: vi.fn().mockRejectedValue(new Error("database unavailable")),
    });
    const service = chatService();

    const result = await chatInteractor(repo, service).invoke(coldChatInput);

    expect(result).toEqual({
      ok: true,
      data: { threadId: PERSISTED_CHAT_THREAD_ID, messageId: PERSISTED_CHAT_MESSAGE_ID, repeated: false },
    });
    expect(service.startChat).toHaveBeenCalledTimes(1);
    expect(repo.settleDraftSend).toHaveBeenCalledWith({
      claim: CLAIM,
      state: "sent",
      unipileMessageId: "provider-message",
      providerMessageId: null,
    });
  });

  it("rejects a same-account cold draft when the chat targets another recipient", async () => {
    const repo = chatRepo();
    const service = chatService();

    const result = await chatInteractor(repo, service).invoke({
      ...coldChatInput,
      attendeeIdentifiers: ["+49 176 11111111"],
    });

    expectDraftConflict(result, CustomErrorCode.draftRecipientsChanged);
    expect(service.startChat).not.toHaveBeenCalled();
    expect(repo.persistOutboundMessageOrThrow).not.toHaveBeenCalled();
    expect(repo.beginDraftSend).not.toHaveBeenCalled();
  });

  it("reports a stale cold-chat revision as a changed draft before provider send", async () => {
    const repo = chatRepo();
    const service = chatService();

    const result = await chatInteractor(repo, service).invoke({
      ...coldChatInput,
      draftRevision: "2026-09-04T09:58:00.000Z",
    });

    expectDraftConflict(result, CustomErrorCode.draftChanged);
    expect(service.startChat).not.toHaveBeenCalled();
    expect(repo.beginDraftSend).not.toHaveBeenCalled();
  });

  it("keeps the cold chat draft and releases its claim when the provider refuses the send", async () => {
    const repo = chatRepo();
    const service = chatService({
      ok: false,
      error: CustomErrorCode.unipileProviderRejected,
    });

    const result = await chatInteractor(repo, service).invoke(coldChatInput);

    expect(result.ok).toBe(false);
    expect(repo.persistOutboundMessageOrThrow).not.toHaveBeenCalled();
    expect(repo.completeDraftSendRemovingDraft).not.toHaveBeenCalled();
    expect(repo.releaseDraftSend).toHaveBeenCalledWith({ claim: CLAIM });
  });

  it("releases the claim when the chat recipient cannot be resolved, before anything is sent", async () => {
    const repo = chatRepo({
      findDraftById: vi.fn().mockResolvedValue({ ...chatDraft, recipientIdentifiers: ["ada-lovelace"] }),
    });
    const service = {
      ...chatService(),
      getProviderProfile: vi.fn().mockResolvedValue({ ok: false, error: CustomErrorCode.unipileProviderRejected }),
    };
    const linkedinAccount = { ...(chatAccount as object), provider: MessagingProvider.linkedin, linkedinProducts: [] };

    const result = await chatInteractor(repo, service, linkedinAccount).invoke({
      ...coldChatInput,
      attendeeIdentifiers: ["ada-lovelace"],
    });

    expect(result.ok).toBe(false);
    expect(repo.beginDraftSend).toHaveBeenCalledOnce();
    expect(service.startChat).not.toHaveBeenCalled();
    expect(repo.releaseDraftSend).toHaveBeenCalledWith({ claim: CLAIM });
    expect(repo.settleDraftSend).not.toHaveBeenCalled();
  });

  it("keeps the cold chat draft but blocks a resend when the provider outcome is unknown", async () => {
    const repo = chatRepo();
    const service = chatService({
      ok: false,
      error: CustomErrorCode.unipileSendOutcomeUnknown,
    });

    const result = await chatInteractor(repo, service).invoke(coldChatInput);

    expect(result.ok).toBe(false);
    expect(repo.completeDraftSendRemovingDraft).not.toHaveBeenCalled();
    expect(repo.releaseDraftSend).not.toHaveBeenCalled();
    expect(repo.settleDraftSend).toHaveBeenCalledWith({ claim: CLAIM, state: "unknown" });
  });
});

describe("DiscardDraftInteractor revision binding", () => {
  it("reports a stale revision as a changed draft so optimistic UI removal can roll back", async () => {
    const repo = {
      deleteDraft: vi.fn().mockResolvedValue({ status: "revision_mismatch" }),
    };

    const result = await new DiscardDraftInteractor(repo as never, mockEntitlementService()).invoke({
      messageId: EMAIL_DRAFT_ID,
      draftRevision: DRAFT_REVISION,
    });

    expectDraftConflict(result, CustomErrorCode.draftChanged);
    expect(repo.deleteDraft).toHaveBeenCalledWith({
      messageId: EMAIL_DRAFT_ID,
      expectedUpdatedAt: DRAFT_UPDATED_AT,
    });
  });
});

const emailDraftThread = {
  id: EMAIL_DRAFT_THREAD_ID,
  connectedAccountId: EMAIL_ACCOUNT_ID,
  unipileThreadId: `draft_${EMAIL_DRAFT_THREAD_ID}`,
  provider: MessagingProvider.google,
  type: MessagingThreadType.single,
  participants: [
    {
      attendeeId: EMAIL_RECIPIENT,
      identifier: EMAIL_RECIPIENT,
      displayName: null,
      pictureUrl: null,
      profileUrl: null,
      headline: null,
      occupation: null,
      isSelf: false,
      record: null,
    },
  ],
};

function saveDraftRepo(overrides: Record<string, unknown> = {}) {
  return {
    findThreadByIdOrThrow: vi.fn().mockResolvedValue(emailDraftThread),
    createConversationDraftOrThrow: vi.fn().mockResolvedValue(persistedEmail),
    findSelfAttendeeForThread: vi.fn(),
    upsertThreadDraftOrThrow: vi.fn().mockResolvedValue(persistedEmail),
    ...overrides,
  };
}

function saveDraftInteractor(repo: any) {
  return new SaveDraftInteractor(
    repo,
    {
      findUsableAccountByIdOrThrow: vi.fn().mockResolvedValue(emailAccount),
    } as never,
    mockEntitlementService(),
  );
}

function expectLockedToRecipients(result: any) {
  expect(result.ok).toBe(false);
  expect(result.error.issues).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        path: ["recipients"],
        params: expect.objectContaining({
          error: CustomErrorCode.draftToRecipientsLocked,
        }),
      }),
    ]),
  );
}

describe("SaveDraftInteractor cold-draft target binding", () => {
  beforeEach(() => vi.clearAllMocks());

  it("checks the sending account once when saving a new conversation draft", async () => {
    const repo = saveDraftRepo();
    const accountRepo = { findUsableAccountByIdOrThrow: vi.fn().mockResolvedValue(emailAccount) };
    const interactor = new SaveDraftInteractor(repo as never, accountRepo as never, mockEntitlementService());

    const result = await interactor.invoke({
      connectedAccountId: EMAIL_ACCOUNT_ID,
      recipients: [EMAIL_RECIPIENT],
      body: "Hello",
    });

    expect(result.ok).toBe(true);
    expect(accountRepo.findUsableAccountByIdOrThrow).toHaveBeenCalledOnce();
    expect(repo.createConversationDraftOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({
        connectedAccountId: EMAIL_ACCOUNT_ID,
        recipients: expect.objectContaining({ to: [expect.objectContaining({ identifier: EMAIL_RECIPIENT })] }),
      }),
    );
    expect(repo.upsertThreadDraftOrThrow).not.toHaveBeenCalled();
  });

  it("never saves a chat draft for a teammate without access to the sending account", async () => {
    const chatThread = {
      ...emailDraftThread,
      provider: MessagingProvider.linkedin,
      unipileThreadId: "provider-chat-thread",
      participants: [{ ...emailDraftThread.participants[0], attendeeId: "handle", identifier: "handle" }],
    };
    const repo = saveDraftRepo({ findThreadByIdOrThrow: vi.fn().mockResolvedValue(chatThread) });
    const interactor = new SaveDraftInteractor(
      repo as never,
      { findUsableAccountByIdOrThrow: vi.fn().mockRejectedValue(new Error("not found")) } as never,
      mockEntitlementService(),
    );

    await expect(interactor.invoke({ threadId: chatThread.id, body: "teammate overwrite" })).rejects.toThrow();
    expect(repo.upsertThreadDraftOrThrow).not.toHaveBeenCalled();
  });

  it("renders email draft HTML before persistence while preserving editable Markdown", async () => {
    const repo = saveDraftRepo();
    const body = "**Review** [project](https://example.com)";
    const result = await saveDraftInteractor(repo).invoke({
      threadId: EMAIL_DRAFT_THREAD_ID,
      body,
    });

    expect(result.ok).toBe(true);
    expect(repo.upsertThreadDraftOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({
        bodyText: body,
        bodyHtml: expect.stringContaining("<strong>Review</strong>"),
      }),
    );
    expect(repo.upsertThreadDraftOrThrow.mock.calls[0][0].bodyHtml).not.toContain("data-customermates-signature");
  });

  it("explains that a saved new message keeps its To recipients", async () => {
    const repo = saveDraftRepo();

    const result = await saveDraftInteractor(repo).invoke({
      threadId: EMAIL_DRAFT_THREAD_ID,
      recipients: ["another@example.com"],
      subject: "Cold email",
      body: "Updated draft",
    });

    expectLockedToRecipients(result);
    expect(repo.createConversationDraftOrThrow).not.toHaveBeenCalled();
    expect(repo.upsertThreadDraftOrThrow).not.toHaveBeenCalled();
  });

  it("accepts the cold-draft recipient after provider normalization", async () => {
    const repo = saveDraftRepo();

    const result = await saveDraftInteractor(repo).invoke({
      threadId: EMAIL_DRAFT_THREAD_ID,
      recipients: [" Recipient@Example.com "],
      subject: "Cold email",
      body: "Updated draft",
    });

    expect(result.ok).toBe(true);
    expect(repo.upsertThreadDraftOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: EMAIL_DRAFT_THREAD_ID,
        recipients: expect.objectContaining({
          to: [expect.objectContaining({ identifier: EMAIL_RECIPIENT })],
        }),
      }),
    );
  });

  it("keeps the submitted To order while matching a canonical multi-recipient shell", async () => {
    const otherRecipient = "other@example.com";
    const repo = saveDraftRepo({
      findThreadByIdOrThrow: vi.fn().mockResolvedValue({
        ...emailDraftThread,
        unipileThreadId: `draft_${EMAIL_DRAFT_THREAD_ID}`,
        type: MessagingThreadType.group,
        participants: [
          emailDraftThread.participants[0],
          {
            ...emailDraftThread.participants[0],
            attendeeId: otherRecipient,
            identifier: otherRecipient,
          },
        ],
      }),
    });

    const result = await saveDraftInteractor(repo).invoke({
      threadId: EMAIL_DRAFT_THREAD_ID,
      recipients: [otherRecipient, "Recipient@Example.com"],
      subject: "Cold email",
      body: "Updated draft",
    });

    expect(result.ok).toBe(true);
    expect(
      repo.upsertThreadDraftOrThrow.mock.calls[0][0].recipients.to.map((recipient: any) => recipient.identifier),
    ).toEqual([otherRecipient, EMAIL_RECIPIENT]);
  });

  it("preserves a normalized handle's case in the stored draft target", async () => {
    const handle = "JohnDoe";
    const repo = saveDraftRepo({
      findThreadByIdOrThrow: vi.fn().mockResolvedValue({
        ...emailDraftThread,
        unipileThreadId: "draft_legacy-linkedin-shell",
        provider: MessagingProvider.linkedin,
        participants: [
          {
            ...emailDraftThread.participants[0],
            attendeeId: handle,
            identifier: handle,
          },
        ],
      }),
    });

    const result = await saveDraftInteractor(repo).invoke({
      threadId: EMAIL_DRAFT_THREAD_ID,
      recipients: [`https://www.linkedin.com/in/${handle}/`],
      body: "Updated draft",
    });

    expect(result.ok).toBe(true);
    const storedIdentifiers = repo.upsertThreadDraftOrThrow.mock.calls[0][0].recipients.to.map(
      (recipient: any) => recipient.identifier,
    );
    expect(storedIdentifiers).toEqual([handle]);
    expect(draftThreadRecipientSetsMatch(MessagingProvider.linkedin, [handle], storedIdentifiers)).toBe(true);
  });
});

describe("draft-thread target normalization", () => {
  it("gives every new conversation draft its own local thread id", () => {
    const first = newDraftThreadProviderId();
    const second = newDraftThreadProviderId();
    expect(first).toMatch(/^draft_/);
    expect(second).toMatch(/^draft_/);
    expect(first).not.toBe(second);
  });

  it("matches a LinkedIn profile URL to a persisted participant handle", () => {
    expect(
      draftThreadRecipientSetsMatch(
        MessagingProvider.linkedin,
        ["recipient-handle"],
        ["https://www.linkedin.com/in/recipient-handle/"],
      ),
    ).toBe(true);
  });
});
