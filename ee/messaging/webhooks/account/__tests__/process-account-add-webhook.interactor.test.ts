import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/env", () => ({ env: { UNIPILE_WEBHOOK_SECRET: "test-secret" } }));
vi.mock("@/core/observability/server", () => ({ captureException: vi.fn(), captureMessage: vi.fn() }));

import { ProcessAccountAddWebhookInteractor } from "../process-account-add-webhook.interactor";
import { signHostedAuthState } from "../../../webhook-signature";

const USER = { id: "user-1", companyId: "company-1" };
const SNAPSHOT = { id: "acc_new", provider: "linkedin", status: "running", name: "Jane Doe" };

function makeAccountRepo(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    findAccountForCompanyByUnipileIdUnscoped: vi.fn().mockResolvedValue(null),
    reviveDeletedAccountUnscoped: vi.fn().mockResolvedValue({ id: "existing-id" }),
    createAccountUnscoped: vi.fn().mockResolvedValue({ id: "new-row-id" }),
    updateAccountUnscoped: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeUserRepo() {
  return { findUserByIdOrThrowUnscoped: vi.fn().mockResolvedValue(USER) };
}

function makeMessagingService() {
  return { getAccount: vi.fn().mockResolvedValue(SNAPSHOT) };
}

function makeBackgroundTaskService() {
  return { dispatch: vi.fn().mockResolvedValue(undefined) };
}

function makeEventService() {
  return { publish: vi.fn().mockResolvedValue(undefined) };
}

function build(accountRepoOverrides: Partial<Record<string, unknown>> = {}) {
  const accountRepo = makeAccountRepo(accountRepoOverrides);
  const userRepo = makeUserRepo();
  const messagingService = makeMessagingService();
  const backgroundTaskService = makeBackgroundTaskService();
  const eventService = makeEventService();
  const funnel = { recordFunnelEventUnscoped: vi.fn().mockResolvedValue(true) };
  const interactor = new ProcessAccountAddWebhookInteractor(
    messagingService as never,
    accountRepo as never,
    userRepo as never,
    backgroundTaskService as never,
    eventService as never,
    funnel,
  );

  return { interactor, accountRepo, userRepo, messagingService, backgroundTaskService, eventService, funnel };
}

beforeEach(() => vi.clearAllMocks());

describe("ProcessAccountAddWebhookInteractor", () => {
  it("creates a fresh row when there is no existing account", async () => {
    const { interactor, accountRepo, backgroundTaskService, eventService, funnel } = build();
    const state = signHostedAuthState(USER.id);

    await interactor.invoke({ type: "account.add", account_id: "acc_new", state, payload: null });

    expect(accountRepo.createAccountUnscoped).toHaveBeenCalledTimes(1);
    expect(funnel.recordFunnelEventUnscoped).toHaveBeenCalledWith({
      companyId: USER.companyId,
      type: "channelConnected",
      occurredAt: expect.any(Date),
    });
    expect(eventService.publish).toHaveBeenCalledWith(
      "connected_account.created",
      expect.objectContaining({ entityId: "new-row-id" }),
      { systemCompanyId: USER.companyId, systemUserId: USER.id },
    );
    expect(backgroundTaskService.dispatch).toHaveBeenCalledWith("backfill-connected-account", {
      connectedAccountId: "new-row-id",
    });
  });

  it("reconnects a row this workspace removed earlier instead of creating a second one", async () => {
    const { interactor, accountRepo, backgroundTaskService, eventService } = build({
      findAccountForCompanyByUnipileIdUnscoped: vi.fn().mockResolvedValue({
        id: "existing-id",
        companyId: USER.companyId,
        status: "deleted",
      }),
    });
    const state = signHostedAuthState(USER.id);

    await interactor.invoke({ type: "account.add", account_id: "acc_new", state, payload: null });

    expect(accountRepo.reviveDeletedAccountUnscoped).toHaveBeenCalledWith("existing-id", USER.id);
    expect(accountRepo.createAccountUnscoped).not.toHaveBeenCalled();
    expect(accountRepo.updateAccountUnscoped).toHaveBeenCalledWith(
      expect.objectContaining({
        unipileAccountId: "acc_new",
        connectedAccountId: "existing-id",
      }),
    );
    expect(eventService.publish).toHaveBeenCalledTimes(1);
    expect(backgroundTaskService.dispatch).toHaveBeenCalledWith("backfill-connected-account", {
      connectedAccountId: "existing-id",
    });
  });

  it("connects a provider account another workspace already holds as a new connection of this workspace", async () => {
    const { interactor, accountRepo } = build();
    const state = signHostedAuthState(USER.id);

    await interactor.invoke({
      type: "account.add",
      account_id: "acc_shared",
      state,
      payload: null,
    });

    expect(accountRepo.findAccountForCompanyByUnipileIdUnscoped).toHaveBeenCalledWith(USER.companyId, "acc_shared");
    expect(accountRepo.createAccountUnscoped).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: USER.companyId,
        unipileAccountId: "acc_shared",
      }),
    );
  });

  it("reuses the existing row when an active row already matches the unipile id", async () => {
    const { interactor, accountRepo, eventService } = build({
      findAccountForCompanyByUnipileIdUnscoped: vi.fn().mockResolvedValue({
        id: "existing-id",
        companyId: USER.companyId,
        status: "ok",
      }),
    });
    const state = signHostedAuthState(USER.id);

    await interactor.invoke({ type: "account.add", account_id: "acc_new", state, payload: null });

    expect(accountRepo.createAccountUnscoped).not.toHaveBeenCalled();
    expect(eventService.publish).not.toHaveBeenCalled();
  });
});
