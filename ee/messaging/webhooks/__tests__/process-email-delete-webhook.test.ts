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

import { ProcessEmailDeleteWebhookInteractor } from "../email/process-email-delete-webhook.interactor";
import { UnipileRequestError } from "../../messaging.service";

const account = {
  id: "acc-1",
  companyId: "co-1",
  unipileAccountId: "acc_uni-1",
  provider: "mail",
  status: "ok",
  folders: [
    { id: "F_INBOX", name: "INBOX", role: "INBOX", totalCount: null, unreadCount: null },
    { id: "F_ARCHIVE", name: "Archive", role: "ARCHIVE", totalCount: null, unreadCount: null },
    { id: "F_TRASH", name: "Trash", role: "TRASH", totalCount: null, unreadCount: null },
  ],
} as any;

const existingRow = {
  id: "msg-1",
  messagingThreadId: "thread-1",
  providerMessageId: "<rfc822@example.com>",
  sentAt: new Date("2026-07-01T10:00:00.000Z"),
} as any;

const envelope = {
  type: "email.delete",
  account_id: "acc_uni-1",
  payload: { email: { id: "OLD_ID_INBOX" }, folder_id: "F_INBOX" },
} as any;

function build(
  overrides: {
    existing?: unknown;
    recentDeletes?: number;
    listEmails?: () => Promise<unknown> | Promise<never>;
    listFolderEmails?: (input: { folderId: string }) => Promise<unknown>;
  } = {},
) {
  const ingest = {
    findMessageByUnipileIdUnscoped: vi
      .fn()
      .mockResolvedValue(overrides.existing === undefined ? existingRow : overrides.existing),
    moveEmailMessageUnscoped: vi.fn().mockResolvedValue({ id: "msg-1" }),
    deleteMessageUnscoped: vi.fn().mockResolvedValue({ id: "msg-1", messagingThreadId: "thread-1" }),
  };
  const accountRepo = {
    findAccountByUnipileIdOrThrowUnscoped: vi.fn().mockResolvedValue(account),
    findAccountByUnipileIdUnscoped: vi.fn().mockResolvedValue(account),
  };
  const eventService = { publish: vi.fn().mockResolvedValue(undefined) };
  const messagingService = {
    listEmails: vi.fn(overrides.listEmails ?? (() => Promise.resolve({ data: [] }))),
    listFolderEmails: vi.fn(overrides.listFolderEmails ?? (() => Promise.resolve({ data: [] }))),
  };
  const events = {
    countRecentEmailDeletesUnscoped: vi.fn().mockResolvedValue(overrides.recentDeletes ?? 1),
  };
  const interactor = new ProcessEmailDeleteWebhookInteractor(
    ingest as any,
    accountRepo as any,
    eventService as any,
    messagingService as any,
    events as any,
  );

  return { interactor, ingest, eventService, messagingService, events };
}

const relocatedEmail = {
  id: "NEW_ID_ARCHIVE",
  message_id: "<rfc822@example.com>",
  date: "2026-07-01T10:00:00.000Z",
  folders: ["F_ARCHIVE"],
};

beforeEach(() => vi.clearAllMocks());

describe("ProcessEmailDeleteWebhookInteractor", () => {
  it("ignores deletes for unknown messages without calling unipile", async () => {
    const { interactor, ingest, eventService, messagingService } = build({ existing: null });

    await interactor.invoke(envelope);

    expect(messagingService.listEmails).not.toHaveBeenCalled();
    expect(ingest.deleteMessageUnscoped).not.toHaveBeenCalled();
    expect(eventService.publish).not.toHaveBeenCalled();
  });

  it("treats a relocated email as a move: updates the row, no delete, no event", async () => {
    const { interactor, ingest, eventService } = build({
      listEmails: () => Promise.resolve({ data: [relocatedEmail] }),
    });

    await interactor.invoke(envelope);

    expect(ingest.moveEmailMessageUnscoped).toHaveBeenCalledWith({
      companyId: "co-1",
      connectedAccountId: "acc-1",
      unipileMessageId: "OLD_ID_INBOX",
      newUnipileMessageId: "NEW_ID_ARCHIVE",
      folderIds: ["F_ARCHIVE"],
    });
    expect(ingest.deleteMessageUnscoped).not.toHaveBeenCalled();
    expect(eventService.publish).not.toHaveBeenCalled();
  });

  it("falls back to a per-folder sweep when the cross-folder list is unavailable", async () => {
    const { interactor, ingest, messagingService } = build({
      listEmails: () => Promise.reject(new UnipileRequestError(501, "api/not_implemented", "")),
      listFolderEmails: ({ folderId }) =>
        Promise.resolve({ data: folderId === "F_ARCHIVE" ? [{ ...relocatedEmail, folders: undefined }] : [] }),
    });

    await interactor.invoke(envelope);

    const sweptFolders = messagingService.listFolderEmails.mock.calls.map(([input]) => input.folderId);
    expect(sweptFolders).toEqual(["F_ARCHIVE"]);
    expect(ingest.moveEmailMessageUnscoped).toHaveBeenCalledWith(
      expect.objectContaining({ newUnipileMessageId: "NEW_ID_ARCHIVE", folderIds: ["F_ARCHIVE"] }),
    );
  });

  it("treats an email found only in a trash-class folder as deleted", async () => {
    const { interactor, ingest, eventService } = build({
      listEmails: () => Promise.resolve({ data: [{ ...relocatedEmail, id: "NEW_ID_TRASH", folders: ["F_TRASH"] }] }),
    });

    await interactor.invoke(envelope);

    expect(ingest.moveEmailMessageUnscoped).not.toHaveBeenCalled();
    expect(ingest.deleteMessageUnscoped).toHaveBeenCalled();
    expect(eventService.publish).toHaveBeenCalledTimes(1);
  });

  it("deletes and publishes when the email is found nowhere", async () => {
    const { interactor, ingest, eventService } = build();

    await interactor.invoke(envelope);

    expect(ingest.deleteMessageUnscoped).toHaveBeenCalledWith({
      companyId: "co-1",
      connectedAccountId: "acc-1",
      unipileMessageId: "OLD_ID_INBOX",
    });
    expect(eventService.publish).toHaveBeenCalledTimes(1);
  });

  it("skips verification during delete bursts and deletes directly", async () => {
    const { interactor, ingest, eventService, messagingService } = build({ recentDeletes: 50 });

    await interactor.invoke(envelope);

    expect(messagingService.listEmails).not.toHaveBeenCalled();
    expect(messagingService.listFolderEmails).not.toHaveBeenCalled();
    expect(ingest.deleteMessageUnscoped).toHaveBeenCalled();
    expect(eventService.publish).toHaveBeenCalledTimes(1);
  });

  it("skips verification when the stored row has no rfc822 message id", async () => {
    const { interactor, ingest, messagingService } = build({
      existing: { ...existingRow, providerMessageId: null },
    });

    await interactor.invoke(envelope);

    expect(messagingService.listEmails).not.toHaveBeenCalled();
    expect(ingest.deleteMessageUnscoped).toHaveBeenCalled();
  });

  it("ignores candidates whose message id does not match", async () => {
    const { interactor, ingest } = build({
      listEmails: () => Promise.resolve({ data: [{ ...relocatedEmail, message_id: "<other@example.com>" }] }),
    });

    await interactor.invoke(envelope);

    expect(ingest.moveEmailMessageUnscoped).not.toHaveBeenCalled();
    expect(ingest.deleteMessageUnscoped).toHaveBeenCalled();
  });

  it("treats a stable-id candidate in a new folder as a move (outlook)", async () => {
    const { interactor, ingest, eventService } = build({
      listEmails: () => Promise.resolve({ data: [{ ...relocatedEmail, id: "OLD_ID_INBOX", folders: ["F_ARCHIVE"] }] }),
    });

    await interactor.invoke(envelope);

    expect(ingest.moveEmailMessageUnscoped).toHaveBeenCalledWith(
      expect.objectContaining({ newUnipileMessageId: "OLD_ID_INBOX", folderIds: ["F_ARCHIVE"] }),
    );
    expect(ingest.deleteMessageUnscoped).not.toHaveBeenCalled();
    expect(eventService.publish).not.toHaveBeenCalled();
  });

  it("treats a candidate still listed only in the origin folder as deleted", async () => {
    const { interactor, ingest, eventService } = build({
      listEmails: () => Promise.resolve({ data: [{ ...relocatedEmail, id: "OLD_ID_INBOX", folders: ["F_INBOX"] }] }),
    });

    await interactor.invoke(envelope);

    expect(ingest.moveEmailMessageUnscoped).not.toHaveBeenCalled();
    expect(ingest.deleteMessageUnscoped).toHaveBeenCalled();
    expect(eventService.publish).toHaveBeenCalledTimes(1);
  });
});
