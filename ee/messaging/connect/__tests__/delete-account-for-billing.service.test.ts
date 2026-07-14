import { describe, it, expect, vi, beforeEach } from "vitest";

import { DeleteAccountForBillingService } from "../delete-account-for-billing.service";

function makeRepo(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    findAccountByIdOrThrowUnscoped: vi.fn(),
    markAccountDeletedUnscoped: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeMessagingService() {
  return {
    deleteAccount: vi.fn().mockResolvedValue(undefined),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DeleteAccountForBillingService.deleteForBillingOrThrow", () => {
  it("deletes the account at Unipile, then marks it deleted", async () => {
    const repo = makeRepo({
      findAccountByIdOrThrowUnscoped: vi.fn().mockResolvedValue({
        id: "acc-1",
        status: "ok",
        unipileAccountId: "acc_uni-1",
      }),
    });
    const messagingService = makeMessagingService();
    const service = new DeleteAccountForBillingService(repo as never, messagingService as never);

    await service.deleteForBillingOrThrow("acc-1");

    expect(messagingService.deleteAccount).toHaveBeenCalledWith({ accountId: "acc_uni-1" });
    expect(repo.markAccountDeletedUnscoped).toHaveBeenCalledWith("acc-1");
    expect(messagingService.deleteAccount.mock.invocationCallOrder[0]).toBeLessThan(
      repo.markAccountDeletedUnscoped.mock.invocationCallOrder[0],
    );
  });

  it("skips silently when the account is already deleted", async () => {
    const repo = makeRepo({
      findAccountByIdOrThrowUnscoped: vi.fn().mockResolvedValue({
        id: "acc-1",
        status: "deleted",
        unipileAccountId: "acc_uni-1",
      }),
    });
    const messagingService = makeMessagingService();
    const service = new DeleteAccountForBillingService(repo as never, messagingService as never);

    await service.deleteForBillingOrThrow("acc-1");

    expect(messagingService.deleteAccount).not.toHaveBeenCalled();
    expect(repo.markAccountDeletedUnscoped).not.toHaveBeenCalled();
  });
});
