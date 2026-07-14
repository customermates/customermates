import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/core/decorators/system-interactor.decorator", () => ({
  SystemInteractor: (target: unknown) => target,
}));

import { DeleteOrphanedUnipileAccountsInteractor } from "../delete-orphaned-unipile-accounts.interactor";

const TWO_DAYS_AGO = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
const ONE_HOUR_AGO = new Date(Date.now() - 60 * 60 * 1000);

function makeRepo(referencedIds: string[] = []) {
  return { findActiveUnipileAccountIdsUnscoped: vi.fn().mockResolvedValue(referencedIds) };
}

function makeMessagingService(accounts: { id: string; createdAt: Date }[] = []) {
  return {
    listAccounts: vi.fn().mockResolvedValue(accounts),
    deleteAccount: vi.fn().mockResolvedValue(undefined),
  };
}

beforeEach(() => vi.clearAllMocks());

describe("DeleteOrphanedUnipileAccountsInteractor", () => {
  it("deletes accounts that no active row references and that are older than a day", async () => {
    const repo = makeRepo(["unipile-1"]);
    const messagingService = makeMessagingService([
      { id: "unipile-1", createdAt: TWO_DAYS_AGO },
      { id: "unipile-orphan", createdAt: TWO_DAYS_AGO },
    ]);
    const interactor = new DeleteOrphanedUnipileAccountsInteractor(repo as never, messagingService as never);

    await interactor.invoke();

    expect(messagingService.deleteAccount).toHaveBeenCalledTimes(1);
    expect(messagingService.deleteAccount).toHaveBeenCalledWith({ accountId: "unipile-orphan" });
  });

  it("spares unreferenced accounts younger than a day (mid-connect race)", async () => {
    const repo = makeRepo();
    const messagingService = makeMessagingService([{ id: "unipile-fresh", createdAt: ONE_HOUR_AGO }]);
    const interactor = new DeleteOrphanedUnipileAccountsInteractor(repo as never, messagingService as never);

    await interactor.invoke();

    expect(messagingService.deleteAccount).not.toHaveBeenCalled();
  });

  it("aborts without deleting when orphans exceed the per-run limit", async () => {
    const repo = makeRepo();
    const orphans = Array.from({ length: 21 }, (_, i) => ({ id: `unipile-${i}`, createdAt: TWO_DAYS_AGO }));
    const messagingService = makeMessagingService(orphans);
    const interactor = new DeleteOrphanedUnipileAccountsInteractor(repo as never, messagingService as never);

    await expect(interactor.invoke()).rejects.toThrow("exceed the per-run limit");
    expect(messagingService.deleteAccount).not.toHaveBeenCalled();
  });

  it("does nothing when every Unipile account is referenced", async () => {
    const repo = makeRepo(["unipile-1"]);
    const messagingService = makeMessagingService([{ id: "unipile-1", createdAt: TWO_DAYS_AGO }]);
    const interactor = new DeleteOrphanedUnipileAccountsInteractor(repo as never, messagingService as never);

    await interactor.invoke();

    expect(messagingService.deleteAccount).not.toHaveBeenCalled();
  });
});
