import { beforeEach, describe, expect, it, vi } from "vitest";

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

function make(
  overrides: {
    lemonSqueezyId?: string | null;
    plan?: string;
    updateResult?: { companyId: string; changedPlan: string | null };
  } = {},
) {
  const lemonSqueezyId = "lemonSqueezyId" in overrides ? overrides.lemonSqueezyId : "ls-1";
  const repo = {
    getSubscriptionOrThrow: vi.fn().mockResolvedValue({
      lemonSqueezyId,
      plan: overrides.plan ?? "pro",
    }),
  };
  const subscriptionService = {
    updateSubscriptionOrThrow: vi.fn().mockResolvedValue(
      overrides.updateResult ?? {
        companyId: "company-1",
        changedPlan: "pro",
        disposition: "updated",
      },
    ),
  };
  const deleteAccountsForPlan = {
    invoke: vi.fn().mockResolvedValue(undefined),
  };
  const interactor = new RefreshSubscriptionInteractor(
    repo as never,
    subscriptionService as never,
    deleteAccountsForPlan as never,
  );

  return {
    interactor,
    subscriptionService,
    deleteAccountsForPlan,
  };
}

beforeEach(() => vi.clearAllMocks());

describe("RefreshSubscriptionInteractor", () => {
  it("is a no-op for an enterprise managed subscription", async () => {
    const { interactor, subscriptionService, deleteAccountsForPlan } = make({
      plan: "enterprise",
    });

    await interactor.invoke();

    expect(subscriptionService.updateSubscriptionOrThrow).not.toHaveBeenCalled();
    expect(deleteAccountsForPlan.invoke).not.toHaveBeenCalled();
  });

  it("syncs by provider id and applies caps after a plan change", async () => {
    const { interactor, subscriptionService, deleteAccountsForPlan } = make({
      updateResult: { companyId: "company-1", changedPlan: "pro" },
    });

    await interactor.invoke();

    expect(subscriptionService.updateSubscriptionOrThrow).toHaveBeenCalledWith("ls-1", mockUser.companyId);
    expect(deleteAccountsForPlan.invoke).toHaveBeenCalledWith({
      companyId: "company-1",
      plan: "pro",
    });
  });

  it("does not apply caps when provider synchronization is a no-op", async () => {
    const { interactor, deleteAccountsForPlan } = make({
      updateResult: { companyId: "company-1", changedPlan: null },
    });

    await interactor.invoke();

    expect(deleteAccountsForPlan.invoke).not.toHaveBeenCalled();
  });

  it("throws before cleanup and dispatch when the subscription has no provider id", async () => {
    const { interactor, subscriptionService, deleteAccountsForPlan } = make({
      lemonSqueezyId: null,
    });

    await expect(interactor.invoke()).rejects.toThrow("LemonSqueezy");
    expect(subscriptionService.updateSubscriptionOrThrow).not.toHaveBeenCalled();
    expect(deleteAccountsForPlan.invoke).not.toHaveBeenCalled();
  });
});
