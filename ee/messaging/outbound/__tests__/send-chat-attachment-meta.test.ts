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
  getTranslations: () => {
    const t = (key: string) => key;
    return Promise.resolve(Object.assign(t, { raw: t }));
  },
  getLocale: () => Promise.resolve("en"),
}));
vi.mock("../../inbox/inbox.schema", async (importActual) => ({
  ...(await importActual<typeof InboxSchemaModule>()),
  toMessagingMessageDto: (message: unknown) => message,
}));

import { SendChatMessageInteractor } from "../send-chat-message.interactor";
import { ValidateThreadIdsInteractor } from "@/core/validation/validators/validate-thread-ids.interactor";
import { getMessagingRepo } from "@/core/di";
import { MessagingProvider, MessagingThreadType } from "@/generated/prisma";

const THREAD_ID = "00000000-0000-4000-8000-000000000001";
const ACCOUNT_ID = "00000000-0000-4000-8000-000000000002";
const DRAFT_ID = "00000000-0000-4000-8000-000000000003";

const DRAFT_REVISION = "2026-09-04T10:00:00.000Z";

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

const attachments = [
  { filename: "photo.png", content_type: "image/png", content: "aGVsbG8gd29ybGQ=" },
  { filename: "second.png", content_type: "image/png", content: "aGVsbG8gd29ybGQ=" },
];

function makeInteractor(repo: any, service: any) {
  return new SendChatMessageInteractor(
    repo,
    { findUsableAccountByIdOrThrow: vi.fn().mockResolvedValue(account) } as never,
    service,
    new ValidateThreadIdsInteractor(getMessagingRepo()),
    mockEntitlementService(),
  );
}

function baseRepo(overrides: Record<string, unknown> = {}) {
  return {
    findThreadByIdOrThrow: vi.fn().mockResolvedValue(thread),
    findDraftById: vi.fn().mockResolvedValue(null),
    findRecentOutboundDuplicate: vi.fn().mockResolvedValue(null),
    findSelfAttendeeForThread: vi.fn().mockResolvedValue(null),
    persistOutboundMessageOrThrow: vi.fn().mockResolvedValue({ id: "new-1", attachmentsMeta: [] }),
    convertDraftToSent: vi.fn().mockResolvedValue({ id: "converted-1", attachmentsMeta: [] }),
    restoreDraftSummaryIfPresent: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function persistedMeta(repo: any) {
  return repo.persistOutboundMessageOrThrow.mock.calls[0][0].message.attachmentsMeta;
}

describe("outbound chat attachment metadata", () => {
  beforeEach(() => vi.clearAllMocks());

  it("never persists an attachment id the provider did not issue", async () => {
    const service = { sendChatMessage: vi.fn().mockResolvedValue({ ok: true, data: { messageId: "m-1" } }) };
    const repo = baseRepo();

    const result: any = await makeInteractor(repo, service).invoke({
      threadId: THREAD_ID,
      text: "here you go",
      attachments,
    });

    expect(result.ok).toBe(true);
    expect(service.sendChatMessage).toHaveBeenCalledTimes(1);

    const meta = persistedMeta(repo);
    expect(meta).toEqual([]);

    const ids = JSON.stringify(meta);
    expect(ids).not.toContain("outbound-");
  });

  it("persists the same empty metadata when converting a draft, so both send paths agree", async () => {
    const service = { sendChatMessage: vi.fn().mockResolvedValue({ ok: true, data: { messageId: "m-1" } }) };
    const repo = baseRepo({
      findDraftById: vi.fn().mockResolvedValue({
        id: DRAFT_ID,
        messagingThreadId: THREAD_ID,
        connectedAccountId: ACCOUNT_ID,
        unipileThreadId: "chat-1",
        recipientIdentifiers: [],
        updatedAt: new Date(DRAFT_REVISION),
      }),
    });

    const result: any = await makeInteractor(repo, service).invoke({
      threadId: THREAD_ID,
      draftMessageId: DRAFT_ID,
      draftRevision: DRAFT_REVISION,
      text: "here you go",
      attachments,
    });

    expect(result.ok).toBe(true);
    expect(repo.convertDraftToSent).toHaveBeenCalledTimes(1);
    expect(repo.convertDraftToSent.mock.calls[0][0].attachmentsMeta).toEqual([]);
    expect(repo.convertDraftToSent).toHaveBeenCalledWith(
      expect.objectContaining({ expectedUpdatedAt: new Date(DRAFT_REVISION) }),
    );
  });

  it("rejects a stale draft revision before sending to the provider", async () => {
    const service = {
      sendChatMessage: vi.fn().mockResolvedValue({ ok: true, data: { messageId: "m-1" } }),
    };
    const repo = baseRepo({
      findDraftById: vi.fn().mockResolvedValue({
        id: DRAFT_ID,
        messagingThreadId: THREAD_ID,
        connectedAccountId: ACCOUNT_ID,
        unipileThreadId: "chat-1",
        recipientIdentifiers: [],
        updatedAt: new Date(DRAFT_REVISION),
      }),
    });

    const result = await makeInteractor(repo, service).invoke({
      threadId: THREAD_ID,
      draftMessageId: DRAFT_ID,
      draftRevision: "2026-09-04T09:59:00.000Z",
      text: "here you go",
    });

    expect(result.ok).toBe(false);
    expect(service.sendChatMessage).not.toHaveBeenCalled();
    expect(repo.convertDraftToSent).not.toHaveBeenCalled();
  });

  it("still forwards the attachments to the provider", async () => {
    const service = { sendChatMessage: vi.fn().mockResolvedValue({ ok: true, data: { messageId: "m-1" } }) };
    const repo = baseRepo();

    await makeInteractor(repo, service).invoke({ threadId: THREAD_ID, text: "here you go", attachments });

    const sent = service.sendChatMessage.mock.calls[0][0];
    expect(sent.attachments).toHaveLength(2);
    expect(sent.attachments[0].filename).toBe("photo.png");
  });
});
