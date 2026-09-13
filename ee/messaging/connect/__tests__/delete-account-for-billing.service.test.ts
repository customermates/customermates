import { describe, it, expect, vi, beforeEach } from "vitest";

import { DeleteAccountForBillingService } from "../delete-account-for-billing.service";
import { DomainEvent } from "@/features/event/domain-events";

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

function makeEventService() {
  return { publish: vi.fn().mockResolvedValue(undefined) };
}

const ACCOUNT = {
  id: "acc-1",
  status: "ok",
  unipileAccountId: "acc_uni-1",
  companyId: "company-1",
  userId: "user-1",
  provider: "linkedin",
  displayName: "Ada Lovelace",
  emailAddress: "ada@example.com",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DeleteAccountForBillingService.deleteForBillingOrThrow", () => {
  it("deletes the account at Unipile, then marks it deleted", async () => {
    const repo = makeRepo({ findAccountByIdOrThrowUnscoped: vi.fn().mockResolvedValue(ACCOUNT) });
    const messagingService = makeMessagingService();
    const eventService = makeEventService();
    const service = new DeleteAccountForBillingService(repo as never, messagingService as never, eventService as never);

    await service.deleteForBillingOrThrow("acc-1", "planDowngrade");

    expect(messagingService.deleteAccount).toHaveBeenCalledWith({ accountId: "acc_uni-1" });
    expect(repo.markAccountDeletedUnscoped).toHaveBeenCalledWith("acc-1");
    expect(messagingService.deleteAccount.mock.invocationCallOrder[0]).toBeLessThan(
      repo.markAccountDeletedUnscoped.mock.invocationCallOrder[0],
    );
  });

  it("skips silently when the account is already deleted", async () => {
    const repo = makeRepo({
      findAccountByIdOrThrowUnscoped: vi.fn().mockResolvedValue({ ...ACCOUNT, status: "deleted" }),
    });
    const messagingService = makeMessagingService();
    const eventService = makeEventService();
    const service = new DeleteAccountForBillingService(repo as never, messagingService as never, eventService as never);

    await service.deleteForBillingOrThrow("acc-1", "planDowngrade");

    expect(messagingService.deleteAccount).not.toHaveBeenCalled();
    expect(repo.markAccountDeletedUnscoped).not.toHaveBeenCalled();
    expect(eventService.publish).not.toHaveBeenCalled();
  });

  it("publishes the removal as a system event attributed to the account owner", async () => {
    const repo = makeRepo({ findAccountByIdOrThrowUnscoped: vi.fn().mockResolvedValue(ACCOUNT) });
    const messagingService = makeMessagingService();
    const eventService = makeEventService();
    const service = new DeleteAccountForBillingService(repo as never, messagingService as never, eventService as never);

    await service.deleteForBillingOrThrow("acc-1", "trialExpired");

    expect(eventService.publish).toHaveBeenCalledExactlyOnceWith(
      DomainEvent.CONNECTED_ACCOUNT_DELETED,
      {
        entityId: "acc-1",
        payload: {
          provider: "linkedin",
          displayName: "Ada Lovelace",
          emailAddress: "ada@example.com",
          removalReason: "trialExpired",
        },
      },
      { systemCompanyId: "company-1", systemUserId: "user-1" },
    );
  });

  it("publishes only after the account is really gone, so a failed provider call leaves no row", async () => {
    const repo = makeRepo({ findAccountByIdOrThrowUnscoped: vi.fn().mockResolvedValue(ACCOUNT) });
    const messagingService = { deleteAccount: vi.fn().mockRejectedValue(new Error("unipile down")) };
    const eventService = makeEventService();
    const service = new DeleteAccountForBillingService(repo as never, messagingService as never, eventService as never);

    await expect(service.deleteForBillingOrThrow("acc-1", "ownerInactive")).rejects.toThrow("unipile down");

    expect(repo.markAccountDeletedUnscoped).not.toHaveBeenCalled();
    expect(eventService.publish).not.toHaveBeenCalled();
  });

  it("carries the cause the caller gave it, so the four removal reasons stay distinguishable", async () => {
    for (const reason of ["planDowngrade", "trialExpired", "subscriptionLapsed", "ownerInactive"] as const) {
      const repo = makeRepo({ findAccountByIdOrThrowUnscoped: vi.fn().mockResolvedValue(ACCOUNT) });
      const eventService = makeEventService();
      const service = new DeleteAccountForBillingService(
        repo as never,
        makeMessagingService() as never,
        eventService as never,
      );

      await service.deleteForBillingOrThrow("acc-1", reason);

      expect(eventService.publish.mock.calls[0][1].payload.removalReason).toBe(reason);
    }
  });
});
