import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/core/decorators/system-interactor.decorator", () => ({
  SystemInteractor: (target: unknown) => target,
}));

import { DeleteConnectedAccountsForExpiredTrialsInteractor } from "../delete-connected-accounts-for-expired-trials.interactor";

function makeRepo(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    findConnectedAccountIdsForExpiredTrialsUnscoped: vi.fn().mockResolvedValue([]),
    findConnectedAccountIdsForLapsedSubscriptionsUnscoped: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

function makeDeleteService() {
  return { deleteForBillingOrThrow: vi.fn().mockResolvedValue(undefined) };
}

beforeEach(() => vi.clearAllMocks());

describe("DeleteConnectedAccountsForExpiredTrialsInteractor", () => {
  it("deletes only the accounts returned by the expired-trial and lapsed-subscription finders", async () => {
    const repo = makeRepo({
      findConnectedAccountIdsForExpiredTrialsUnscoped: vi.fn().mockResolvedValue(["acc-1", "acc-2"]),
      findConnectedAccountIdsForLapsedSubscriptionsUnscoped: vi.fn().mockResolvedValue(["acc-3"]),
    });
    const deleteService = makeDeleteService();
    const interactor = new DeleteConnectedAccountsForExpiredTrialsInteractor(repo as never, deleteService as never);

    await interactor.invoke();

    expect(deleteService.deleteForBillingOrThrow).toHaveBeenCalledTimes(3);
    expect(deleteService.deleteForBillingOrThrow).toHaveBeenCalledWith("acc-1");
    expect(deleteService.deleteForBillingOrThrow).toHaveBeenCalledWith("acc-2");
    expect(deleteService.deleteForBillingOrThrow).toHaveBeenCalledWith("acc-3");
  });

  it("de-duplicates an account id returned by both finders", async () => {
    const repo = makeRepo({
      findConnectedAccountIdsForExpiredTrialsUnscoped: vi.fn().mockResolvedValue(["acc-1"]),
      findConnectedAccountIdsForLapsedSubscriptionsUnscoped: vi.fn().mockResolvedValue(["acc-1"]),
    });
    const deleteService = makeDeleteService();
    const interactor = new DeleteConnectedAccountsForExpiredTrialsInteractor(repo as never, deleteService as never);

    await interactor.invoke();

    expect(deleteService.deleteForBillingOrThrow).toHaveBeenCalledTimes(1);
  });

  it("does nothing when no accounts are due for deletion (naturally idempotent)", async () => {
    const repo = makeRepo();
    const deleteService = makeDeleteService();
    const interactor = new DeleteConnectedAccountsForExpiredTrialsInteractor(repo as never, deleteService as never);

    await interactor.invoke();

    expect(deleteService.deleteForBillingOrThrow).not.toHaveBeenCalled();
  });
});
