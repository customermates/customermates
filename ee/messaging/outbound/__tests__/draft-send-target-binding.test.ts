import type * as InboxSchemaModule from "../../inbox/inbox.schema";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { mockEntitlementService } from "@/tests/helpers/mock-entitlement-service";
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

import { draftThreadProviderId, draftThreadRecipientSetsMatch } from "../../draft-thread";
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

const CHAT_ACCOUNT_ID = "00000000-0000-4000-8000-000000000011";
const CHAT_DRAFT_THREAD_ID = "00000000-0000-4000-8000-000000000012";
const CHAT_DRAFT_ID = "00000000-0000-4000-8000-000000000013";
const PERSISTED_CHAT_THREAD_ID = "00000000-0000-4000-8000-000000000014";
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
    findLatestEmailReplyReferenceForThread: vi.fn().mockResolvedValue(null),
    findDraftById: vi.fn().mockResolvedValue(emailDraft),
    discardDraftAfterSend: vi.fn().mockResolvedValue(undefined),
    findRecentOutboundDuplicate: vi.fn().mockResolvedValue(null),
    persistOutboundMessageOrThrow: vi.fn().mockResolvedValue(persistedEmail),
    convertDraftToSent: vi.fn().mockResolvedValue(null),
    restoreDraftSummaryIfPresent: vi.fn().mockResolvedValue(undefined),
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

function expectDraftNotFound(result: any) {
  expect(result.ok).toBe(false);
  expect(result.error.issues).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        params: expect.objectContaining({
          error: CustomErrorCode.draftMessageNotFound,
        }),
      }),
    ]),
  );
}

describe("SendEmailInteractor draft target binding", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ["another account", { connectedAccountId: OTHER_ACCOUNT_ID, unipileThreadId: "draft_email" }],
    ["a real provider thread", { connectedAccountId: EMAIL_ACCOUNT_ID, unipileThreadId: "email-thread" }],
  ])("rejects a cold draft bound to %s before provider send", async (_label, mismatch) => {
    const repo = emailRepo({
      findDraftById: vi.fn().mockResolvedValue({ ...emailDraft, ...mismatch }),
    });
    const service = emailService();

    const result = await emailInteractor(repo, service).invoke(coldEmailInput);

    expectDraftNotFound(result);
    expect(service.sendEmail).not.toHaveBeenCalled();
    expect(service.getEmail).not.toHaveBeenCalled();
    expect(repo.discardDraftAfterSend).not.toHaveBeenCalled();
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

    expectDraftNotFound(result);
    expect(service.sendEmail).not.toHaveBeenCalled();
    expect(repo.convertDraftToSent).not.toHaveBeenCalled();
  });

  it("rejects a same-account cold draft when the send targets another recipient", async () => {
    const repo = emailRepo();
    const service = emailService();

    const result = await emailInteractor(repo, service).invoke({
      ...coldEmailInput,
      to: [{ identifier: "another@example.com" }],
    });

    expectDraftNotFound(result);
    expect(service.sendEmail).not.toHaveBeenCalled();
    expect(service.getEmail).not.toHaveBeenCalled();
    expect(repo.discardDraftAfterSend).not.toHaveBeenCalled();
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
    expect(repo.discardDraftAfterSend).toHaveBeenCalledWith({
      messageId: EMAIL_DRAFT_ID,
      expectedUpdatedAt: DRAFT_UPDATED_AT,
    });
  });

  it("adopts a successful cold send before durably discarding its draft shell", async () => {
    const repo = emailRepo();
    const service = emailService();

    const result = await emailInteractor(repo, service).invoke(coldEmailInput);

    expect(result.ok).toBe(true);
    expect(service.getEmail).toHaveBeenCalledWith({
      accountId: "email-account",
      emailId: "unipile-email",
      timeoutMs: 5000,
    });
    expect(repo.persistOutboundMessageOrThrow).toHaveBeenCalledTimes(1);
    expect(repo.discardDraftAfterSend).toHaveBeenCalledWith({
      messageId: EMAIL_DRAFT_ID,
      expectedUpdatedAt: DRAFT_UPDATED_AT,
    });
    expect(service.sendEmail.mock.invocationCallOrder[0]).toBeLessThan(service.getEmail.mock.invocationCallOrder[0]);
    expect(service.getEmail.mock.invocationCallOrder[0]).toBeLessThan(
      repo.discardDraftAfterSend.mock.invocationCallOrder[0],
    );
  });

  it("still discards a delivered cold draft when provider adoption cannot resolve it", async () => {
    const repo = emailRepo();
    const service = {
      ...emailService(),
      getEmail: vi.fn().mockRejectedValue(new Error("not indexed yet")),
    };

    const result = await emailInteractor(repo, service).invoke(coldEmailInput);

    expect(result).toEqual({ ok: true, data: null });
    expect(repo.persistOutboundMessageOrThrow).not.toHaveBeenCalled();
    expect(repo.discardDraftAfterSend).toHaveBeenCalledWith({
      messageId: EMAIL_DRAFT_ID,
      expectedUpdatedAt: DRAFT_UPDATED_AT,
    });
  });

  it("rejects a stale client revision before provider send", async () => {
    const repo = emailRepo();
    const service = emailService();

    const result = await emailInteractor(repo, service).invoke({
      ...coldEmailInput,
      draftRevision: "2026-09-04T09:58:00.000Z",
    });

    expectDraftNotFound(result);
    expect(service.sendEmail).not.toHaveBeenCalled();
    expect(repo.discardDraftAfterSend).not.toHaveBeenCalled();
  });

  it("passes the client-observed revision into reply-draft conversion", async () => {
    const repo = emailRepo({
      findDraftById: vi.fn().mockResolvedValue({
        ...emailDraft,
        messagingThreadId: REPLY_THREAD_ID,
        unipileThreadId: "email-thread",
      }),
      convertDraftToSent: vi.fn().mockResolvedValue(persistedEmail),
    });
    const service = emailService();

    const result = await emailInteractor(repo, service).invoke({
      ...coldEmailInput,
      connectedAccountId: undefined,
      threadId: REPLY_THREAD_ID,
    });

    expect(result.ok).toBe(true);
    expect(repo.convertDraftToSent).toHaveBeenCalledWith(
      expect.objectContaining({
        messageId: EMAIL_DRAFT_ID,
        expectedUpdatedAt: DRAFT_UPDATED_AT,
      }),
    );
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
    discardDraftAfterSend: vi.fn().mockResolvedValue(undefined),
    persistOutboundMessageOrThrow: vi.fn().mockResolvedValue({ messagingThreadId: PERSISTED_CHAT_THREAD_ID }),
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

function chatInteractor(repo: any, service: any) {
  return new StartChatInteractor(
    {
      findUsableAccountByIdOrThrow: vi.fn().mockResolvedValue(chatAccount),
    } as never,
    {
      findContactChannelCompanyWide: vi.fn(),
      saveResolvedContactChannel: vi.fn(),
    } as never,
    service,
    repo,
    mockEntitlementService(),
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

    expectDraftNotFound(result);
    expect(service.startChat).not.toHaveBeenCalled();
    expect(repo.persistOutboundMessageOrThrow).not.toHaveBeenCalled();
    expect(repo.discardDraftAfterSend).not.toHaveBeenCalled();
  });

  it("normalizes a matching phone target and discards its draft only after send and persistence", async () => {
    const repo = chatRepo();
    const service = chatService();

    const result = await chatInteractor(repo, service).invoke(coldChatInput);

    expect(result).toEqual({
      ok: true,
      data: { threadId: PERSISTED_CHAT_THREAD_ID },
    });
    expect(repo.discardDraftAfterSend).toHaveBeenCalledWith({
      messageId: CHAT_DRAFT_ID,
      expectedUpdatedAt: DRAFT_UPDATED_AT,
    });
    expect(service.startChat.mock.invocationCallOrder[0]).toBeLessThan(
      repo.persistOutboundMessageOrThrow.mock.invocationCallOrder[0],
    );
    expect(repo.persistOutboundMessageOrThrow.mock.invocationCallOrder[0]).toBeLessThan(
      repo.discardDraftAfterSend.mock.invocationCallOrder[0],
    );
  });

  it("rejects a same-account cold draft when the chat targets another recipient", async () => {
    const repo = chatRepo();
    const service = chatService();

    const result = await chatInteractor(repo, service).invoke({
      ...coldChatInput,
      attendeeIdentifiers: ["+49 176 11111111"],
    });

    expectDraftNotFound(result);
    expect(service.startChat).not.toHaveBeenCalled();
    expect(repo.persistOutboundMessageOrThrow).not.toHaveBeenCalled();
    expect(repo.discardDraftAfterSend).not.toHaveBeenCalled();
  });

  it("rejects a stale cold-chat revision before provider send", async () => {
    const repo = chatRepo();
    const service = chatService();

    const result = await chatInteractor(repo, service).invoke({
      ...coldChatInput,
      draftRevision: "2026-09-04T09:58:00.000Z",
    });

    expectDraftNotFound(result);
    expect(service.startChat).not.toHaveBeenCalled();
    expect(repo.discardDraftAfterSend).not.toHaveBeenCalled();
  });

  it("keeps the cold chat draft when the provider send fails", async () => {
    const repo = chatRepo();
    const service = chatService({
      ok: false,
      error: CustomErrorCode.unipileServiceUnavailable,
    });

    const result = await chatInteractor(repo, service).invoke(coldChatInput);

    expect(result.ok).toBe(false);
    expect(repo.persistOutboundMessageOrThrow).not.toHaveBeenCalled();
    expect(repo.discardDraftAfterSend).not.toHaveBeenCalled();
  });
});

describe("DiscardDraftInteractor revision binding", () => {
  it("reports a stale revision as a failure so optimistic UI removal can roll back", async () => {
    const repo = {
      deleteDraft: vi.fn().mockResolvedValue({ status: "revision_mismatch" }),
    };

    const result = await new DiscardDraftInteractor(repo as never, mockEntitlementService()).invoke({
      messageId: EMAIL_DRAFT_ID,
      draftRevision: DRAFT_REVISION,
    });

    expectDraftNotFound(result);
    expect(repo.deleteDraft).toHaveBeenCalledWith({
      messageId: EMAIL_DRAFT_ID,
      expectedUpdatedAt: DRAFT_UPDATED_AT,
    });
  });
});

const emailDraftThread = {
  id: EMAIL_DRAFT_THREAD_ID,
  connectedAccountId: EMAIL_ACCOUNT_ID,
  unipileThreadId: draftThreadProviderId(MessagingProvider.google, [EMAIL_RECIPIENT]),
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
      contact: null,
    },
  ],
};

function saveDraftRepo(overrides: Record<string, unknown> = {}) {
  return {
    findThreadByIdOrThrow: vi.fn().mockResolvedValue(emailDraftThread),
    findOrCreateDraftThread: vi.fn(),
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

function expectInvalidRecipients(result: any) {
  expect(result.ok).toBe(false);
  expect(result.error.issues).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        path: ["recipients"],
        params: expect.objectContaining({
          error: CustomErrorCode.invalidChannelValue,
        }),
      }),
    ]),
  );
}

describe("SaveDraftInteractor cold-draft target binding", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects changing recipients on an existing cold-draft shell", async () => {
    const repo = saveDraftRepo();

    const result = await saveDraftInteractor(repo).invoke({
      threadId: EMAIL_DRAFT_THREAD_ID,
      recipients: ["another@example.com"],
      subject: "Cold email",
      body: "Updated draft",
    });

    expectInvalidRecipients(result);
    expect(repo.findOrCreateDraftThread).not.toHaveBeenCalled();
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
        unipileThreadId: draftThreadProviderId(MessagingProvider.google, [EMAIL_RECIPIENT, otherRecipient]),
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
  it("canonicalizes email whitespace and case before deriving an identity", () => {
    expect(draftThreadProviderId(MessagingProvider.google, [" Recipient@Example.com "])).toBe(
      draftThreadProviderId(MessagingProvider.google, [EMAIL_RECIPIENT]),
    );
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
