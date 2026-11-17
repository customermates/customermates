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

import { ConnectedAccountStatus } from "@/generated/prisma";
import { ProcessAccountStatusWebhookInteractor } from "../account/process-account-status-webhook.interactor";

const account = { unipileAccountId: "acc_uni-1", status: ConnectedAccountStatus.ok } as never;

function build(status = "running", products?: Record<string, string>) {
  const accountRepo = {
    findAccountByUnipileIdUnscoped: vi.fn().mockResolvedValue(account),
    findAccountByUnipileIdOrThrowUnscoped: vi.fn(),
    updateAccountUnscoped: vi.fn().mockResolvedValue(undefined),
  };

  const messagingService = {
    getAccount: vi.fn().mockResolvedValue({
      id: "acc_uni-1",
      provider: "google",
      status,
      metadata: { products_connection_status: products },
    }),
  };
  return {
    interactor: new ProcessAccountStatusWebhookInteractor(accountRepo as never, messagingService as never),
    accountRepo,
    messagingService,
  };
}

describe("account status webhook", () => {
  it("treats a partial account as needing credentials, because a product requires authentication", async () => {
    const { interactor, accountRepo } = build("partial");

    await interactor.invoke({ type: "account.status.partial", account_id: "acc_uni-1" });

    expect(accountRepo.updateAccountUnscoped).toHaveBeenCalledWith(
      expect.objectContaining({ status: ConnectedAccountStatus.credentials, syncing: false }),
    );
  });

  it("treats a degraded account as errored, because a product is interrupted without needing authentication", async () => {
    const { interactor, accountRepo } = build("degraded");

    await interactor.invoke({ type: "account.status.degraded", account_id: "acc_uni-1" });

    expect(accountRepo.updateAccountUnscoped).toHaveBeenCalledWith(
      expect.objectContaining({ status: ConnectedAccountStatus.error, syncing: false }),
    );
  });

  it("keeps a running account healthy and syncing", async () => {
    const { interactor, accountRepo } = build();

    await interactor.invoke({ type: "account.status.running", account_id: "acc_uni-1" });

    const call = accountRepo.updateAccountUnscoped.mock.calls[0][0];
    expect(call.status).toBe(ConnectedAccountStatus.ok);
    expect(call.syncing).toBeUndefined();
  });

  it("does not silently fall back to connecting for either new status", async () => {
    for (const type of ["account.status.partial", "account.status.degraded"] as const) {
      const { interactor, accountRepo } = build(type.slice("account.status.".length));
      await interactor.invoke({ type, account_id: "acc_uni-1" });
      expect(accountRepo.updateAccountUnscoped.mock.calls[0][0].status).not.toBe(ConnectedAccountStatus.connecting);
    }
  });

  it("preserves the calendar on a Gmail-only disconnection and records the product reason", async () => {
    const { interactor, accountRepo } = build("partial", { gmail: "disconnected", calendar: "running" });
    await interactor.invoke({
      type: "account.status.disconnected",
      account_id: "acc_uni-1",
      payload: { product: "gmail", reason: "Mailbox unavailable" },
    });
    expect(accountRepo.updateAccountUnscoped).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "ok",
        hasMessaging: false,
        hasCalendar: true,
        connectionDetails: {
          status: "partial",
          products: { gmail: "disconnected", calendar: "running" },
          reason: "Mailbox unavailable",
        },
      }),
    );
  });

  it("uses the current snapshot when an old product event arrives after recovery", async () => {
    const { interactor, accountRepo } = build("running", { gmail: "running", calendar: "running" });
    await interactor.invoke({
      type: "account.status.errored",
      account_id: "acc_uni-1",
      payload: { product: "calendar", reason: "provider" },
    });
    expect(accountRepo.updateAccountUnscoped).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "ok",
        connectionDetails: expect.objectContaining({ reason: null }),
      }),
    );
  });

  it("does not replace the cached state when the snapshot cannot be read", async () => {
    const { interactor, accountRepo, messagingService } = build();
    messagingService.getAccount.mockRejectedValue(new Error("temporary provider outage"));
    await expect(interactor.invoke({ type: "account.status.running", account_id: "acc_uni-1" })).rejects.toThrow(
      "temporary",
    );
    expect(accountRepo.updateAccountUnscoped).not.toHaveBeenCalled();
  });
});
