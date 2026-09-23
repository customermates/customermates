import { describe, it, expect, vi, beforeEach } from "vitest";

import { Action, Resource } from "@/generated/prisma";

import { createMockUser, createMockUserWithPermissions } from "@/tests/helpers/mock-user";
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
const { runWithTenant } = await import("@/core/decorators/tenant-context");
const { ForbiddenError } = await import("@/core/errors/app-errors");

function make(overrides: {
  lemonSqueezyId?: string | null;
  plan?: string;
  updateResult?: { companyId: string; changedPlan: string | null };
}) {
  const lemonSqueezyId = "lemonSqueezyId" in overrides ? overrides.lemonSqueezyId : "ls-1";
  const repo = {
    getSubscriptionOrThrow: vi.fn().mockResolvedValue({ lemonSqueezyId, plan: overrides.plan ?? "pro" }),
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

describe("RefreshSubscriptionInteractor authorization", () => {
  const readOnlyMember = () => ({
    ...createMockUserWithPermissions([
      { resource: Resource.company, action: Action.readOwn },
      { resource: Resource.company, action: Action.readAll },
    ]),
    id: mockUser.id,
    companyId: mockUser.companyId,
  });

  it("refuses a member who can only read the company, because refreshing rewrites billing state", async () => {
    const { interactor, subscriptionService, deleteAccountsForPlan } = make({});

    await expect(runWithTenant(readOnlyMember(), () => interactor.invoke())).rejects.toThrow(ForbiddenError);

    expect(subscriptionService.updateSubscriptionOrThrow).not.toHaveBeenCalled();
    expect(deleteAccountsForPlan.invoke).not.toHaveBeenCalled();
  });

  it("allows a member who can manage the company", async () => {
    const manager = {
      ...createMockUserWithPermissions([{ resource: Resource.company, action: Action.update }]),
      id: mockUser.id,
      companyId: mockUser.companyId,
    };
    const { interactor, subscriptionService } = make({});

    await expect(runWithTenant(manager, () => interactor.invoke())).resolves.toEqual({ ok: true, data: null });

    expect(subscriptionService.updateSubscriptionOrThrow).toHaveBeenCalledOnce();
  });
});

describe("RefreshSubscriptionInteractor", () => {
  it("is a no-op for an enterprise (managed) subscription", async () => {
    const { interactor, subscriptionService, deleteAccountsForPlan } = make({ plan: "enterprise" });

    await interactor.invoke();

    expect(subscriptionService.updateSubscriptionOrThrow).not.toHaveBeenCalled();
    expect(deleteAccountsForPlan.invoke).not.toHaveBeenCalled();
  });

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
