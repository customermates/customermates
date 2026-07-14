import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/env", () => ({ env: { UNIPILE_WEBHOOK_SECRET: "test-secret" } }));
vi.mock("@sentry/node", () => ({ captureException: vi.fn(), captureMessage: vi.fn() }));

import { ProcessAccountAddWebhookInteractor } from "../process-account-add-webhook.interactor";
import { signHostedAuthState } from "../../../webhook-signature";

const USER = { id: "user-1", companyId: "company-1" };
const SNAPSHOT = { id: "acc_new", provider: "linkedin", status: "running", name: "Jane Doe" };

function makeAccountRepo(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    findAccountByUnipileIdUnscoped: vi.fn().mockResolvedValue(null),
    createAccountUnscoped: vi.fn().mockResolvedValue({ id: "new-row-id" }),
    updateAccountUnscoped: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeUserRepo() {
  return { findExtendedUserByIdOrThrowUnscoped: vi.fn().mockResolvedValue(USER) };
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
  const interactor = new ProcessAccountAddWebhookInteractor(
    messagingService as never,
    accountRepo as never,
    userRepo as never,
    backgroundTaskService as never,
    eventService as never,
  );

  return { interactor, accountRepo, userRepo, messagingService, backgroundTaskService, eventService };
}

beforeEach(() => vi.clearAllMocks());

describe("ProcessAccountAddWebhookInteractor", () => {
  it("creates a fresh row when there is no existing account", async () => {
    const { interactor, accountRepo, backgroundTaskService, eventService } = build();
    const state = signHostedAuthState(USER.id);

    await interactor.invoke({ type: "account.add", account_id: "acc_new", state, payload: null });

    expect(accountRepo.createAccountUnscoped).toHaveBeenCalledTimes(1);
    expect(eventService.publish).toHaveBeenCalledWith(
      "connected_account.created",
      expect.objectContaining({ entityId: "new-row-id" }),
      { systemCompanyId: USER.companyId, systemUserId: USER.id },
    );
    expect(backgroundTaskService.dispatch).toHaveBeenCalledWith("backfill-connected-account", {
      connectedAccountId: "new-row-id",
    });
  });

  it("short-circuits without side effects when the existing row's status is deleted", async () => {
    const { interactor, accountRepo, messagingService, backgroundTaskService, eventService } = build({
      findAccountByUnipileIdUnscoped: vi.fn().mockResolvedValue({
        id: "existing-id",
        companyId: USER.companyId,
        status: "deleted",
      }),
    });
    const state = signHostedAuthState(USER.id);

    await interactor.invoke({ type: "account.add", account_id: "acc_new", state, payload: null });

    expect(messagingService.getAccount).not.toHaveBeenCalled();
    expect(accountRepo.updateAccountUnscoped).not.toHaveBeenCalled();
    expect(eventService.publish).not.toHaveBeenCalled();
    expect(backgroundTaskService.dispatch).not.toHaveBeenCalled();
  });

  it("reuses the existing row when an active row already matches the unipile id", async () => {
    const { interactor, accountRepo, eventService } = build({
      findAccountByUnipileIdUnscoped: vi.fn().mockResolvedValue({
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
