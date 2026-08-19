import { describe, it, expect, vi } from "vitest";
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

import { ProcessAccountStatusWebhookInteractor } from "../account/process-account-status-webhook.interactor";
import { ProcessEmailFolderWebhookInteractor } from "../email/process-email-folder-webhook.interactor";

function accountRepoReturning(account: unknown) {
  return {
    findAccountByUnipileIdUnscoped: vi.fn().mockResolvedValue(account),
    findAccountByUnipileIdOrThrowUnscoped: vi.fn().mockRejectedValue(
      Object.assign(
        new Error("An operation failed because it depends on one or more records that were required but not found."),
        {
          name: "PrismaClientKnownRequestError",
          code: "P2025",
        },
      ),
    ),
    updateAccountUnscoped: vi.fn().mockResolvedValue(undefined),
  };
}

describe("webhook handlers for an account that no longer exists", () => {
  it("returns without writing when the status webhook cannot resolve its account", async () => {
    const accountRepo = accountRepoReturning(null);
    const interactor = new ProcessAccountStatusWebhookInteractor(accountRepo as never);

    await expect(
      interactor.invoke({ type: "account.status.disconnected", account_id: "acc_uni-gone" }),
    ).resolves.toBeUndefined();

    expect(accountRepo.updateAccountUnscoped).not.toHaveBeenCalled();
  });

  it("returns without calling unipile when the folder webhook cannot resolve its account", async () => {
    const accountRepo = accountRepoReturning(null);
    const messagingService = { listFolders: vi.fn() };
    const interactor = new ProcessEmailFolderWebhookInteractor(accountRepo as never, messagingService as never);

    await expect(
      interactor.invoke({ type: "email.folder.update", account_id: "acc_uni-gone" }),
    ).resolves.toBeUndefined();

    expect(messagingService.listFolders).not.toHaveBeenCalled();
    expect(accountRepo.updateAccountUnscoped).not.toHaveBeenCalled();
  });
});
