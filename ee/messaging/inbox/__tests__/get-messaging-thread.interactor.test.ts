import { describe, expect, it, vi } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";
import { mockEntitlementService } from "@/tests/helpers/mock-entitlement-service";
import {
  MOCK_ENV_MODULE,
  MOCK_PRISMA_DB_MODULE,
  MOCK_ZOD_MODULE,
  createMockDiModule,
} from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();
const translations = vi.hoisted(() => ({ threadNotFound: "Conversazione non trovata" }));

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);
vi.mock("next-intl/server", () => ({
  getTranslations: (namespace?: string) => {
    const t = (key: string) =>
      `${namespace ? `${namespace}.` : ""}${key}` === "Common.errors.threadNotFound"
        ? translations.threadNotFound
        : `${namespace ? `${namespace}.` : ""}${key}`;
    return Promise.resolve(Object.assign(t, { raw: t }));
  },
  getLocale: () => Promise.resolve("en"),
}));

import { CustomErrorCode } from "@/core/validation/validation.types";
import { GetMessagingThreadInteractor } from "../get-messaging-thread.interactor";

const THREAD_ID = "00000000-0000-4000-8000-000000000001";

describe("GetMessagingThreadInteractor", () => {
  it("returns a coded, localized error when the thread does not exist", async () => {
    const repo = {
      findThreadById: vi.fn().mockResolvedValue(null),
      listMessagesForThread: vi.fn(),
      listThreadFolderPlacements: vi.fn().mockResolvedValue([]),
    };
    const accountRepo = { listAccountOwnersByIds: vi.fn(), findFolderContextById: vi.fn() };

    const result = await new GetMessagingThreadInteractor(repo, accountRepo, mockEntitlementService()).invoke({
      threadId: THREAD_ID,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.issues[0]).toMatchObject({
      message: translations.threadNotFound,
      params: { error: CustomErrorCode.threadNotFound },
    });
    expect(repo.listMessagesForThread).not.toHaveBeenCalled();
    expect(accountRepo.listAccountOwnersByIds).not.toHaveBeenCalled();
  });

  const thread = (provider: string) => ({
    id: THREAD_ID,
    connectedAccountId: "00000000-0000-4000-8000-0000000000a1",
    unipileThreadId: "u-thread-1",
    provider,
    type: "single" as const,
    name: null,
    subject: null,
    preview: null,
    previewKind: null,
    lastMessageAt: new Date("2026-09-01T10:00:00Z"),
    participants: [],
    state: "open" as const,
    sharedToCrm: false,
    accountShared: false,
    isOwner: true,
    lastMessageFromSelf: false,
    lastMessageSenderName: null,
    createdAt: new Date("2026-09-01T09:00:00Z"),
    updatedAt: new Date("2026-09-01T10:00:00Z"),
  });

  const message = (folderIds: string[], sentAt: string) => ({
    id: "00000000-0000-4000-8000-0000000000b1",
    messagingThreadId: THREAD_ID,
    connectedAccountId: "00000000-0000-4000-8000-0000000000a1",
    unipileMessageId: "u-msg-1",
    providerMessageId: null,
    provider: "mail" as const,
    direction: "inbound" as const,
    origin: "external" as const,
    subject: null,
    bodyText: null,
    bodyHtml: null,
    previewText: null,
    sender: {
      attendeeId: "a1",
      displayName: null,
      identifier: "sender@example.com",
      pictureUrl: null,
      profileUrl: null,
      headline: null,
      occupation: null,
      isSelf: false,
    },
    recipients: { to: [], cc: [], bcc: [] },
    attachmentsMeta: [],
    folderIds,
    reactions: [],
    isEvent: false,
    isDeleted: false,
    isHidden: false,
    isDraft: false,
    sentAt: new Date(sentAt),
    editedAt: null,
    createdAt: new Date(sentAt),
    updatedAt: new Date(sentAt),
  });

  const CATALOG = [
    { id: "inbox", name: "INBOX", role: "INBOX", totalCount: null, unreadCount: null },
    { id: "sent", name: "Sent Mail", role: "SENT", totalCount: null, unreadCount: null },
    { id: "archive", name: "Archive", role: "ARCHIVE", totalCount: null, unreadCount: null },
  ];

  function build(
    provider: string,
    messages: ReturnType<typeof message>[],
    context: unknown,
    placements: ReturnType<typeof message>[] = messages,
  ) {
    const repo = {
      findThreadById: vi.fn().mockResolvedValue(thread(provider)),
      listMessagesForThread: vi.fn().mockResolvedValue({ messages, total: messages.length }),
      listThreadFolderPlacements: vi.fn().mockResolvedValue(placements),
    };
    const accountRepo = {
      listAccountOwnersByIds: vi.fn().mockResolvedValue({}),
      findFolderContextById: vi.fn().mockResolvedValue(context),
    };

    return { repo, accountRepo };
  }

  it("reports the folder an email thread currently sits in", async () => {
    const { repo, accountRepo } = build(
      "mail",
      [message(["inbox"], "2026-09-01T10:00:00Z"), message(["archive"], "2026-09-01T12:00:00Z")],
      { folders: CATALOG, selectedFolderIds: ["inbox", "archive"] },
    );

    const result = await new GetMessagingThreadInteractor(repo, accountRepo, mockEntitlementService()).invoke({
      threadId: THREAD_ID,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.folderContext?.currentFolderIds).toEqual(["archive"]);
    expect(result.data.folderContext?.folders).toHaveLength(3);
  });

  it("reports a folder the inbox filter hides, which the visible message list can never reveal", async () => {
    const catalog = [...CATALOG, { id: "trash", name: "Trash", role: "TRASH", totalCount: null, unreadCount: null }];
    const { repo, accountRepo } = build(
      "mail",
      [message(["sent"], "2026-09-01T12:00:00Z")],
      { folders: catalog, selectedFolderIds: ["inbox", "archive"] },
      [message(["trash"], "2026-09-01T10:00:00Z"), message(["sent"], "2026-09-01T12:00:00Z")],
    );

    const result = await new GetMessagingThreadInteractor(repo, accountRepo, mockEntitlementService()).invoke({
      threadId: THREAD_ID,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.folderContext?.currentFolderIds).toEqual(["trash"]);
  });

  it("omits the folder context for a chat provider, which has no folders", async () => {
    const { repo, accountRepo } = build("linkedin", [message([], "2026-09-01T10:00:00Z")], {
      folders: CATALOG,
      selectedFolderIds: [],
    });

    const result = await new GetMessagingThreadInteractor(repo, accountRepo, mockEntitlementService()).invoke({
      threadId: THREAD_ID,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.folderContext).toBeNull();
    expect(accountRepo.findFolderContextById).not.toHaveBeenCalled();
  });

  it("omits the folder context when the account has never synced its folders", async () => {
    const { repo, accountRepo } = build("mail", [message(["inbox"], "2026-09-01T10:00:00Z")], null);

    const result = await new GetMessagingThreadInteractor(repo, accountRepo, mockEntitlementService()).invoke({
      threadId: THREAD_ID,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.folderContext).toBeNull();
  });
});
