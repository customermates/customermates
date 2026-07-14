import { describe, it, expect, vi, beforeEach } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";
import {
  MOCK_ENV_MODULE,
  createMockDiModule,
  MOCK_ZOD_MODULE,
  MOCK_PRISMA_DB_MODULE,
} from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();

vi.mock("@/env", () => ({ env: { ...MOCK_ENV_MODULE.env } }));
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);

const { RefreshSubscriptionInteractor } = await import("../refresh-subscription.interactor");

function make(overrides: {
  lemonSqueezyId?: string | null;
  updateResult?: { companyId: string; changedPlan: string | null };
}) {
  const lemonSqueezyId = "lemonSqueezyId" in overrides ? overrides.lemonSqueezyId : "ls-1";
  const repo = {
    getSubscriptionOrThrow: vi.fn().mockResolvedValue({ lemonSqueezyId }),
  };
  const subscriptionService = {
    updateSubscriptionOrThrow: vi
      .fn()
      .mockResolvedValue(overrides.updateResult ?? { companyId: "company-1", changedPlan: null }),
  };
  const deleteAccountsForPlan = { invoke: vi.fn().mockResolvedValue(undefined) };

  const interactor = new RefreshSubscriptionInteractor(
    repo as never,
    subscriptionService as never,
    deleteAccountsForPlan as never,
  );

  return { interactor, repo, subscriptionService, deleteAccountsForPlan };
}

beforeEach(() => vi.clearAllMocks());

describe("RefreshSubscriptionInteractor", () => {
  it("syncs against the stored LemonSqueezy id under the current company", async () => {
    const { interactor, subscriptionService } = make({ updateResult: { companyId: "company-1", changedPlan: null } });

    await interactor.invoke();

    expect(subscriptionService.updateSubscriptionOrThrow).toHaveBeenCalledWith("ls-1", mockUser.companyId);
  });

  it("enforces plan caps when the sync reports a changed plan", async () => {
    const { interactor, deleteAccountsForPlan } = make({
      updateResult: { companyId: "company-1", changedPlan: "pro" },
    });

    await interactor.invoke();

    expect(deleteAccountsForPlan.invoke).toHaveBeenCalledWith({ companyId: "company-1", plan: "pro" });
  });

  it("does not enforce plan caps when the sync reports no plan change", async () => {
    const { interactor, deleteAccountsForPlan } = make({ updateResult: { companyId: "company-1", changedPlan: null } });

    await interactor.invoke();

    expect(deleteAccountsForPlan.invoke).not.toHaveBeenCalled();
  });

  it("throws when the subscription has no LemonSqueezy id", async () => {
    const { interactor, deleteAccountsForPlan } = make({ lemonSqueezyId: null });

    await expect(interactor.invoke()).rejects.toThrow("LemonSqueezy");
    expect(deleteAccountsForPlan.invoke).not.toHaveBeenCalled();
  });
});
