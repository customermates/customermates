import { describe, expect, it, vi } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";
import { MOCK_ENV_MODULE, MOCK_PRISMA_DB_MODULE, createMockDiModule } from "@/tests/helpers/interactor-test-setup";

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => createMockDiModule(() => createMockUser()));
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);
vi.mock("@/core/observability/server", () => ({ captureException: vi.fn(), captureMessage: vi.fn() }));

import { RefreshConnectedAccountStatusesInteractor } from "../refresh-connected-account-statuses.interactor";

function build() {
  const repo = {
    findAccountsNeedingStatusRefreshUnscoped: vi.fn().mockResolvedValue([
      { unipileAccountId: "acc_one", connectionDetails: null },
      { unipileAccountId: "acc_two", connectionDetails: null },
    ]),
    updateAccountUnscoped: vi.fn().mockResolvedValue(null),
  };
  const service = {
    getAccount: vi.fn().mockResolvedValue({
      id: "acc_one",
      provider: "google",
      status: "partial",
      metadata: { products_connection_status: { gmail: "disconnected", calendar: "running" } },
    }),
  };
  return { repo, service, interactor: new RefreshConnectedAccountStatusesInteractor(repo, service as never) };
}

describe("periodic connected-account status reconciliation", () => {
  it("refreshes stale cached states independently of history backfill and status webhook delivery", async () => {
    const { repo, service, interactor } = build();
    expect(await interactor.invoke()).toEqual({ refreshed: 2, failed: 0 });
    expect(repo.findAccountsNeedingStatusRefreshUnscoped).toHaveBeenCalledWith(expect.any(Date));
    expect(service.getAccount.mock.calls).toEqual([["acc_one"], ["acc_two"]]);
    expect(repo.updateAccountUnscoped).toHaveBeenCalledWith(
      expect.objectContaining({
        unipileAccountId: "acc_one",
        status: "ok",
        hasMessaging: false,
        hasCalendar: true,
        statusCheckedAt: expect.any(Date),
      }),
    );
    expect(repo.updateAccountUnscoped.mock.calls[0][0]).not.toHaveProperty("lastSyncedAt");
    expect(repo.updateAccountUnscoped.mock.calls[0][0]).not.toHaveProperty("syncing");
  });

  it("keeps failed snapshots unchanged and still checks the remaining accounts", async () => {
    const { repo, service, interactor } = build();
    service.getAccount.mockRejectedValueOnce(new Error("temporary outage"));
    expect(await interactor.invoke()).toEqual({ refreshed: 1, failed: 1 });
    expect(repo.updateAccountUnscoped).toHaveBeenCalledOnce();
    expect(repo.updateAccountUnscoped).toHaveBeenCalledWith(expect.objectContaining({ unipileAccountId: "acc_two" }));
  });

  it("clears an obsolete syncing indicator when a missed webhook left the account disconnected", async () => {
    const { repo, service, interactor } = build();
    service.getAccount.mockResolvedValueOnce({
      id: "acc_one",
      provider: "google",
      status: "disconnected",
      metadata: { products_connection_status: { gmail: "disconnected", calendar: "disconnected" } },
    });
    await interactor.invoke();
    expect(repo.updateAccountUnscoped).toHaveBeenCalledWith(
      expect.objectContaining({
        unipileAccountId: "acc_one",
        status: "credentials",
        syncing: false,
      }),
    );
  });
});
