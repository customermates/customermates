import { beforeEach, describe, expect, it, vi } from "vitest";

import { Action, Resource } from "@/generated/prisma";
import { runWithTenant } from "@/core/decorators/tenant-context";
import { createMockUser, createMockUserWithPermissions } from "@/tests/helpers/mock-user";

vi.mock("@/core/decorators/tenant-interactor.decorator", () => ({
  TenantInteractor: () => (constructor: unknown) => constructor,
}));

const { GetSubscriptionInteractor } = await import("../get-subscription.interactor");

const subscription = {
  status: "pastDue",
  plan: "pro",
  quantity: 2,
  trialEndDate: null,
  currentPeriodEnd: null,
  lemonSqueezyId: "sub-1",
};

function make(overrides: Partial<typeof subscription> = {}) {
  const repo = {
    getSubscriptionOrThrow: vi.fn().mockResolvedValue({ ...subscription, ...overrides }),
  };
  const userRepo = { countActiveUsers: vi.fn().mockResolvedValue(2) };
  const service = {
    getSubscriptionOrThrowUnscoped: vi.fn().mockResolvedValue({
      data: {
        attributes: {
          urls: { customer_portal: "https://billing.example.com/portal" },
        },
      },
    }),
  };
  return {
    interactor: new GetSubscriptionInteractor(repo as never, userRepo as never, service as never),
    service,
  };
}

beforeEach(() => vi.clearAllMocks());

describe("GetSubscriptionInteractor billing authorization", () => {
  it("returns the portal URL to a system administrator", async () => {
    const { interactor, service } = make();

    const result = await runWithTenant(createMockUser(), () => interactor.invoke());

    expect(result.data).toMatchObject({
      canManageSubscription: true,
      hasProviderSubscription: true,
      customerPortalUrl: "https://billing.example.com/portal",
    });
    expect(service.getSubscriptionOrThrowUnscoped).toHaveBeenCalledWith("sub-1");
  });

  it("returns the portal URL to a role with company update permission", async () => {
    const { interactor } = make();
    const user = createMockUserWithPermissions([{ resource: Resource.company, action: Action.update }]);

    const result = await runWithTenant(user, () => interactor.invoke());

    expect(result.data.canManageSubscription).toBe(true);
    expect(result.data.customerPortalUrl).toBe("https://billing.example.com/portal");
  });

  it("never fetches or returns the signed portal URL to a read-only role", async () => {
    const { interactor, service } = make();
    const user = createMockUserWithPermissions([{ resource: Resource.company, action: Action.readOwn }]);

    const result = await runWithTenant(user, () => interactor.invoke());

    expect(result.data.canManageSubscription).toBe(false);
    expect(result.data.customerPortalUrl).toBeNull();
    expect(service.getSubscriptionOrThrowUnscoped).not.toHaveBeenCalled();
  });

  it("does not expose a self-serve portal for an Enterprise workspace", async () => {
    const { interactor, service } = make({ plan: "enterprise" });

    const result = await runWithTenant(createMockUser(), () => interactor.invoke());

    expect(result.data.canManageSubscription).toBe(true);
    expect(result.data.hasProviderSubscription).toBe(true);
    expect(result.data.customerPortalUrl).toBeNull();
    expect(service.getSubscriptionOrThrowUnscoped).not.toHaveBeenCalled();
  });
});
