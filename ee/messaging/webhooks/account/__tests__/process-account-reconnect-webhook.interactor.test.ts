import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

vi.mock("@sentry/node", () => ({ captureException: vi.fn(), captureMessage: vi.fn() }));

import { ProcessAccountReconnectWebhookInteractor } from "../process-account-reconnect-webhook.interactor";
import { DomainEvent } from "@/features/event/domain-events";

const account = {
  id: "account-1",
  companyId: "company-1",
  userId: "user-1",
  unipileAccountId: "unipile-1",
  provider: "mail",
  displayName: "Synthetic",
  emailAddress: "synthetic@example.test",
  status: "credentials",
};

function build(providerStatus: string | z.ZodError, localStatus = account.status) {
  const accountRepo = {
    findAccountByUnipileIdUnscoped: vi.fn().mockResolvedValue({ ...account, status: localStatus }),
    updateAccountUnscoped: vi.fn().mockResolvedValue(undefined),
  };
  const getAccount =
    providerStatus instanceof z.ZodError
      ? vi.fn().mockRejectedValue(providerStatus)
      : vi.fn().mockResolvedValue({ status: providerStatus });
  const messagingService = { getAccount };
  const backgroundTaskService = { dispatch: vi.fn().mockResolvedValue(undefined) };
  const eventService = { publish: vi.fn().mockResolvedValue(undefined) };
  const interactor = new ProcessAccountReconnectWebhookInteractor(
    messagingService as never,
    accountRepo as never,
    backgroundTaskService as never,
    eventService as never,
  );
  return { interactor, eventService };
}

describe("ProcessAccountReconnectWebhookInteractor", () => {
  it("announces the reconnect only once the provider reports the account healthy", async () => {
    const { interactor, eventService } = build("running");

    await interactor.invoke({ type: "account.reconnect", account_id: "unipile-1" });

    expect(eventService.publish).toHaveBeenCalledWith(
      DomainEvent.CONNECTED_ACCOUNT_RECONNECTED,
      expect.objectContaining({ entityId: "account-1" }),
      { systemCompanyId: "company-1", systemUserId: "user-1" },
    );
  });

  it("stays silent while the account still needs credentials", async () => {
    const { interactor, eventService } = build("credentials");

    await interactor.invoke({ type: "account.reconnect", account_id: "unipile-1" });

    expect(eventService.publish).not.toHaveBeenCalled();
  });

  it("still announces the reconnect when the status webhook already marked the account healthy", async () => {
    const { interactor, eventService } = build("running", "ok");

    await interactor.invoke({ type: "account.reconnect", account_id: "unipile-1" });

    expect(eventService.publish).toHaveBeenCalledOnce();
  });

  it("stays silent when the provider status cannot be read", async () => {
    const { interactor, eventService } = build(new z.ZodError([]));

    await interactor.invoke({ type: "account.reconnect", account_id: "unipile-1" });

    expect(eventService.publish).not.toHaveBeenCalled();
  });
});
