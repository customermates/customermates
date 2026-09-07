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

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);
vi.mock("next-intl/server", () => ({
  getTranslations: (namespace?: string) => {
    const t = (key: string) => `${namespace ? `${namespace}.` : ""}${key}`;
    return Promise.resolve(Object.assign(t, { raw: t }));
  },
  getLocale: () => Promise.resolve("en"),
}));

import { CustomErrorCode } from "@/core/validation/validation.types";
import { MoveEmailThreadInteractor } from "../move-email-thread.interactor";

const THREAD_ID = "00000000-0000-4000-8000-000000000001";

const folder = (id: string, name: string, role: string | null) => ({
  id,
  name,
  role,
  totalCount: null,
  unreadCount: null,
});

const CATALOG = [
  folder("inbox", "INBOX", "INBOX"),
  folder("archive", "Archive", null),
  folder("sent", "Sent", "SENT"),
  folder("trash", "Trash", "TRASH"),
];

function setup(overrides: {
  provider?: string;
  messages?: { id: string; unipileMessageId: string; folderIds: string[] }[];
  moveResults?: unknown[];
  folders?: ReturnType<typeof folder>[];
  selectedFolderIds?: string[];
}) {
  const repo = {
    findThreadForMoveOrThrow: vi.fn().mockResolvedValue({
      id: THREAD_ID,
      connectedAccountId: "acct-1",
      provider: overrides.provider ?? "mail",
      companyId: "company-1",
      unipileAccountId: "unipile-acct-1",
    }),
    listThreadMovableMessages: vi.fn().mockResolvedValue(overrides.messages ?? []),
    moveEmailMessageUnscoped: vi.fn().mockResolvedValue({ id: "row-1" }),
  };
  const accountRepo = {
    listAccountOwnersByIds: vi.fn(),
    findFolderContextById: vi.fn().mockResolvedValue({
      folders: overrides.folders ?? CATALOG,
      selectedFolderIds: overrides.selectedFolderIds ?? ["inbox"],
    }),
  };
  const moveEmail = vi.fn();
  for (const result of overrides.moveResults ?? []) moveEmail.mockResolvedValueOnce(result);
  const messagingService = { moveEmail };

  return { repo, accountRepo, messagingService };
}

function invoke(
  parts: ReturnType<typeof setup>,
  data: { threadId: string; folderId: string } = { threadId: THREAD_ID, folderId: "archive" },
) {
  return new MoveEmailThreadInteractor(
    parts.repo as never,
    parts.accountRepo as never,
    parts.messagingService as never,
    mockEntitlementService(),
  ).invoke(data);
}

describe("MoveEmailThreadInteractor", () => {
  it("moves every message of the thread and reports the folder by name", async () => {
    const parts = setup({
      messages: [
        { id: "a", unipileMessageId: "old-a", folderIds: ["inbox"] },
        { id: "b", unipileMessageId: "old-b", folderIds: ["inbox"] },
      ],
      moveResults: [
        { ok: true, data: { id: "new-a", folderIds: ["archive"] } },
        { ok: true, data: { id: "new-b", folderIds: ["archive"] } },
      ],
    });

    const result = await invoke(parts);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.movedCount).toBe(2);
      expect(result.data.folderName).toBe("Archive");
      expect(result.data.hiddenFromInbox).toBe(true);
    }
    expect(parts.messagingService.moveEmail).toHaveBeenCalledTimes(2);
  });

  it("records the replacement id the provider mints, because a move invalidates the old one", async () => {
    const parts = setup({
      messages: [{ id: "a", unipileMessageId: "old-a", folderIds: ["inbox"] }],
      moveResults: [{ ok: true, data: { id: "new-a", folderIds: ["archive"] } }],
    });

    await invoke(parts);

    expect(parts.repo.moveEmailMessageUnscoped).toHaveBeenCalledWith(
      expect.objectContaining({ unipileMessageId: "old-a", newUnipileMessageId: "new-a", folderIds: ["archive"] }),
    );
  });

  it("rejects a folder id that is not in the account's own catalog", async () => {
    const parts = setup({ messages: [{ id: "a", unipileMessageId: "old-a", folderIds: ["inbox"] }] });

    const result = await invoke(parts, { threadId: THREAD_ID, folderId: "someone-elses-folder" });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(JSON.stringify(result.error)).toContain(CustomErrorCode.emailFolderNotFound);
    expect(parts.messagingService.moveEmail).not.toHaveBeenCalled();
  });

  it("refuses Sent as a destination", async () => {
    const parts = setup({ messages: [{ id: "a", unipileMessageId: "old-a", folderIds: ["inbox"] }] });

    const result = await invoke(parts, { threadId: THREAD_ID, folderId: "sent" });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(JSON.stringify(result.error)).toContain(CustomErrorCode.emailFolderNotMovable);
    expect(parts.messagingService.moveEmail).not.toHaveBeenCalled();
  });

  it("refuses a chat thread, which has no provider folders", async () => {
    const parts = setup({ provider: "whatsapp", messages: [] });

    const result = await invoke(parts);

    expect(result.ok).toBe(false);
    expect(parts.messagingService.moveEmail).not.toHaveBeenCalled();
  });

  it("skips messages already filed in the destination", async () => {
    const parts = setup({
      messages: [
        { id: "a", unipileMessageId: "old-a", folderIds: ["archive"] },
        { id: "b", unipileMessageId: "old-b", folderIds: ["inbox"] },
      ],
      moveResults: [{ ok: true, data: { id: "new-b", folderIds: ["archive"] } }],
    });

    const result = await invoke(parts);

    expect(parts.messagingService.moveEmail).toHaveBeenCalledTimes(1);
    if (result.ok) expect(result.data.movedCount).toBe(1);
  });

  it("leaves the Sent copy in Sent, because a conversation legitimately spans folders", async () => {
    const parts = setup({
      messages: [
        { id: "a", unipileMessageId: "inbox-a", folderIds: ["inbox"] },
        { id: "b", unipileMessageId: "sent-b", folderIds: ["sent"] },
      ],
      moveResults: [{ ok: true, data: { id: "new-a", folderIds: ["archive"] } }],
    });

    const result = await invoke(parts);

    expect(parts.messagingService.moveEmail).toHaveBeenCalledTimes(1);
    expect(parts.messagingService.moveEmail).toHaveBeenCalledWith(expect.objectContaining({ emailId: "inbox-a" }));
    if (result.ok) expect(result.data.movedCount).toBe(1);
  });

  it("moves nothing when every message in the thread lives in Sent", async () => {
    const parts = setup({ messages: [{ id: "b", unipileMessageId: "sent-b", folderIds: ["sent"] }] });

    const result = await invoke(parts);

    expect(parts.messagingService.moveEmail).not.toHaveBeenCalled();
    if (result.ok) expect(result.data.movedCount).toBe(0);
  });

  it("surfaces a provider refusal instead of reporting a move that did not happen", async () => {
    const parts = setup({
      messages: [{ id: "a", unipileMessageId: "old-a", folderIds: ["inbox"] }],
      moveResults: [{ ok: false, error: CustomErrorCode.unipileProviderError }],
    });

    const result = await invoke(parts);

    expect(result.ok).toBe(false);
    expect(parts.repo.moveEmailMessageUnscoped).not.toHaveBeenCalled();
  });

  it("reports a partial move honestly instead of claiming the whole thread moved", async () => {
    const parts = setup({
      messages: [
        { id: "a", unipileMessageId: "old-a", folderIds: ["inbox"] },
        { id: "b", unipileMessageId: "old-b", folderIds: ["inbox"] },
      ],
      moveResults: [
        { ok: true, data: { id: "new-a", folderIds: ["archive"] } },
        { ok: false, error: CustomErrorCode.unipileProviderError },
      ],
    });

    const result = await invoke(parts);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.movedCount).toBe(1);
      expect(result.data.failedCount).toBe(1);
    }
    expect(parts.repo.moveEmailMessageUnscoped).toHaveBeenCalledTimes(1);
  });

  it("does not claim the thread left the inbox when the destination is watched", async () => {
    const parts = setup({
      messages: [{ id: "a", unipileMessageId: "old-a", folderIds: ["inbox"] }],
      moveResults: [{ ok: true, data: { id: "new-a", folderIds: ["archive"] } }],
      selectedFolderIds: ["inbox", "archive"],
    });

    const result = await invoke(parts);

    if (result.ok) expect(result.data.hiddenFromInbox).toBe(false);
  });
});

describe("MoveEmailThreadInteractor safety", () => {
  it("refuses Trash as a destination, because relocation there hard-deletes the local record", async () => {
    const parts = setup({ messages: [{ id: "a", unipileMessageId: "old-a", folderIds: ["inbox"] }] });

    const result = await invoke(parts, { threadId: THREAD_ID, folderId: "trash" });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(JSON.stringify(result.error)).toContain(CustomErrorCode.emailFolderNotMovable);
    expect(parts.messagingService.moveEmail).not.toHaveBeenCalled();
  });

  it("refuses a Google account, whose folders_ids overwrites every label", async () => {
    const parts = setup({ provider: "google", messages: [{ id: "a", unipileMessageId: "a", folderIds: ["inbox"] }] });

    const result = await invoke(parts);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(JSON.stringify(result.error)).toContain(CustomErrorCode.emailFolderMoveUnsupported);
    expect(parts.messagingService.moveEmail).not.toHaveBeenCalled();
  });

  it("leaves a message whose placement is unknown alone rather than guessing", async () => {
    const parts = setup({ messages: [{ id: "a", unipileMessageId: "a", folderIds: [] }] });

    const result = await invoke(parts);

    expect(parts.messagingService.moveEmail).not.toHaveBeenCalled();
    if (result.ok) {
      expect(result.data.movedCount).toBe(0);
      expect(result.data.skippedCount).toBe(1);
    }
  });

  it("does not claim the thread left the inbox when nothing actually moved", async () => {
    const parts = setup({ messages: [{ id: "b", unipileMessageId: "sent-b", folderIds: ["sent"] }] });

    const result = await invoke(parts);

    if (result.ok) {
      expect(result.data.movedCount).toBe(0);
      expect(result.data.hiddenFromInbox).toBe(false);
    }
  });

  it("skips a message whose folder union still contains Sent", async () => {
    const parts = setup({ messages: [{ id: "b", unipileMessageId: "b", folderIds: ["inbox", "sent"] }] });

    const result = await invoke(parts);

    expect(parts.messagingService.moveEmail).not.toHaveBeenCalled();
    if (result.ok) expect(result.data.skippedCount).toBe(1);
  });

  it("counts a local write that throws as failed rather than as moved", async () => {
    const parts = setup({
      messages: [{ id: "a", unipileMessageId: "old-a", folderIds: ["inbox"] }],
      moveResults: [{ ok: true, data: { id: "new-a", folderIds: ["archive"] } }],
    });
    parts.repo.moveEmailMessageUnscoped.mockRejectedValueOnce(new Error("unique constraint"));

    const result = await invoke(parts);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.movedCount).toBe(0);
      expect(result.data.failedCount).toBe(1);
    }
  });
});
