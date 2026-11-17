import { describe, expect, it, vi } from "vitest";

vi.mock("@/core/observability/server", () => ({ captureException: vi.fn(), captureMessage: vi.fn() }));

import { ProcessAccountReadyWebhookInteractor } from "../process-account-ready-webhook.interactor";

const account = {
  id: "account-1",
  companyId: "company-1",
  userId: "user-1",
  unipileAccountId: "unipile-1",
  provider: "linkedin",
  status: "connecting",
  connectionDetails: null,
};

function build(providerStatus: string | null, options: { updated?: unknown; stored?: unknown } = {}) {
  const accountRepo = {
    findAccountByUnipileIdUnscoped: vi
      .fn()
      .mockResolvedValueOnce(account)
      .mockResolvedValue(options.stored ?? account),
    updateAccountUnscoped: vi.fn().mockResolvedValue("updated" in options ? options.updated : account),
  };
  const messagingService = {
    getAccount: vi.fn().mockResolvedValue({ id: "unipile-1", provider: "LINKEDIN", status: providerStatus }),
  };
  const backgroundTaskService = { dispatch: vi.fn().mockResolvedValue(undefined) };
  const interactor = new ProcessAccountReadyWebhookInteractor(
    accountRepo as never,
    backgroundTaskService as never,
    messagingService as never,
  );
  return { interactor, accountRepo, backgroundTaskService };
}

const invoke = (interactor: ProcessAccountReadyWebhookInteractor) =>
  interactor.invoke({ type: "account.initial_sync.completed", account_id: "unipile-1" });

describe("ProcessAccountReadyWebhookInteractor", () => {
  it("starts the history import for a healthy account", async () => {
    const { interactor, accountRepo, backgroundTaskService } = build("running");

    await invoke(interactor);

    expect(accountRepo.updateAccountUnscoped).toHaveBeenCalledWith(
      expect.objectContaining({ status: "ok", syncing: true }),
    );
    expect(backgroundTaskService.dispatch).toHaveBeenCalledWith("backfill-connected-account", {
      connectedAccountId: "account-1",
    });
  });

  it("still starts the import while the provider has not reported a status yet, so the import waits for it", async () => {
    const { interactor, accountRepo, backgroundTaskService } = build(null);

    await invoke(interactor);

    expect(accountRepo.updateAccountUnscoped).toHaveBeenCalledWith(
      expect.objectContaining({ status: "connecting", syncing: true }),
    );
    expect(backgroundTaskService.dispatch).toHaveBeenCalledOnce();
  });

  it("starts the import when a newer status check already saved the account", async () => {
    const { interactor, backgroundTaskService } = build("running", {
      updated: null,
      stored: { ...account, status: "ok" },
    });

    await invoke(interactor);

    expect(backgroundTaskService.dispatch).toHaveBeenCalledOnce();
  });

  it("does not mark an account syncing after an account-wide failure, but lets the import decide", async () => {
    const { interactor, accountRepo, backgroundTaskService } = build("disconnected");

    await invoke(interactor);

    expect(accountRepo.updateAccountUnscoped).toHaveBeenCalledWith(
      expect.objectContaining({ status: "credentials", syncing: false }),
    );
    expect(backgroundTaskService.dispatch).toHaveBeenCalledOnce();
  });

  it("does nothing more for an account that was deleted in the meantime", async () => {
    const { interactor, backgroundTaskService } = build("running", {
      updated: null,
      stored: { ...account, status: "deleted" },
    });

    await invoke(interactor);

    expect(backgroundTaskService.dispatch).not.toHaveBeenCalled();
  });
});
