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

import { ProcessEmailFolderWebhookInteractor } from "../email/process-email-folder-webhook.interactor";

const syncedAccount = {
  id: "acc-1",
  companyId: "co-1",
  unipileAccountId: "acc_uni-1",
  provider: "google",
  status: "ok",
  foldersSyncedAt: new Date("2026-07-01T00:00:00.000Z"),
  selectedFolderIds: ["INBOX"],
} as any;

const folders = [
  { id: "INBOX", role: "inbox", name: "Inbox" },
  { id: "SENT", role: "sent", name: "Sent" },
  { id: "PROJECTS", role: null, name: "Projects" },
];

function build(account: unknown, folderItems: unknown[]) {
  const accountRepo = {
    findAccountByUnipileIdOrThrowUnscoped: vi.fn().mockResolvedValue(account),
    updateAccountUnscoped: vi.fn().mockResolvedValue(undefined),
  };
  const messagingService = {
    listFolders: vi.fn().mockResolvedValue({ data: folderItems, next_cursor: null }),
  };
  const interactor = new ProcessEmailFolderWebhookInteractor(accountRepo as any, messagingService as any);

  return { interactor, accountRepo, messagingService };
}

const envelope = { type: "email.folder.create", account_id: "acc_uni-1" } as any;

beforeEach(() => vi.clearAllMocks());

describe("email folder webhook", () => {
  it("refreshes the folder catalog and sent folder ids, preserving the existing selection", async () => {
    const { interactor, accountRepo } = build(syncedAccount, folders);

    await interactor.invoke(envelope);

    const args = accountRepo.updateAccountUnscoped.mock.calls[0][0];
    expect(args.unipileAccountId).toBe("acc_uni-1");
    expect(args.folders.map((folder: { id: string }) => folder.id)).toEqual(["INBOX", "SENT", "PROJECTS"]);
    expect(args.sentFolderIds).toEqual(["SENT"]);
    expect(args.foldersSyncedAt).toBeInstanceOf(Date);
    expect(args).not.toHaveProperty("selectedFolderIds");
  });

  it("defaults the folder selection when the account was never folder-synced", async () => {
    const { interactor, accountRepo } = build({ ...syncedAccount, foldersSyncedAt: null }, folders);

    await interactor.invoke(envelope);

    const args = accountRepo.updateAccountUnscoped.mock.calls[0][0];
    expect(args.selectedFolderIds).toContain("INBOX");
  });

  it("does not touch the account when the provider returns no folders", async () => {
    const { interactor, accountRepo } = build(syncedAccount, []);

    await interactor.invoke(envelope);

    expect(accountRepo.updateAccountUnscoped).not.toHaveBeenCalled();
  });

  it("skips deleted accounts without fetching folders", async () => {
    const { interactor, accountRepo, messagingService } = build({ ...syncedAccount, status: "deleted" }, folders);

    await interactor.invoke(envelope);

    expect(messagingService.listFolders).not.toHaveBeenCalled();
    expect(accountRepo.updateAccountUnscoped).not.toHaveBeenCalled();
  });
});
