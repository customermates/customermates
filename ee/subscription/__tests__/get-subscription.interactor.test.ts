import { beforeEach, describe, expect, it, vi } from "vitest";

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

const { GetSubscriptionInteractor } = await import("../get-subscription.interactor");
const { runWithTenant } = await import("@/core/decorators/tenant-context");

const PORTAL_URL = "https://billing.example/portal/abc";

function make() {
  const repo = {
    getSubscriptionOrThrow: vi.fn().mockResolvedValue({
      status: "active",
      plan: "pro",
      quantity: 3,
      trialEndDate: null,
      currentPeriodEnd: null,
      lemonSqueezyId: "ls-1",
    }),
  };
  const userRepo = { countActiveUsers: vi.fn().mockResolvedValue(3) };
  const lemonSqueezyService = {
    getSubscriptionOrThrowUnscoped: vi.fn().mockResolvedValue({
      data: { attributes: { urls: { customer_portal: PORTAL_URL } } },
    }),
  };

  return {
    interactor: new GetSubscriptionInteractor(repo as never, userRepo as never, lemonSqueezyService as never),
    lemonSqueezyService,
  };
}

const readOnlyMember = () => ({
  ...createMockUserWithPermissions([
    { resource: Resource.company, action: Action.readOwn },
    { resource: Resource.company, action: Action.readAll },
  ]),
  id: mockUser.id,
  companyId: mockUser.companyId,
});

const billingManager = () => ({
  ...createMockUserWithPermissions([
    { resource: Resource.company, action: Action.readOwn },
    { resource: Resource.company, action: Action.update },
  ]),
  id: mockUser.id,
  companyId: mockUser.companyId,
});

beforeEach(() => vi.clearAllMocks());

describe("GetSubscriptionInteractor customer portal exposure", () => {
  it("withholds the billing portal link from a member who cannot act on billing", async () => {
    const { interactor, lemonSqueezyService } = make();

    const result = await runWithTenant(readOnlyMember(), () => interactor.invoke());

    expect(result.data.customerPortalUrl).toBeNull();
    expect(lemonSqueezyService.getSubscriptionOrThrowUnscoped).not.toHaveBeenCalled();
  });

  it("still reports the plan and seats to that member, because reading the subscription is allowed", async () => {
    const { interactor } = make();

    const result = await runWithTenant(readOnlyMember(), () => interactor.invoke());

    expect(result.data).toMatchObject({ plan: "pro", status: "active", activeUsers: 3, hasActiveSubscription: true });
  });

  it("gives the portal link to a member who can manage billing", async () => {
    const { interactor, lemonSqueezyService } = make();

    const result = await runWithTenant(billingManager(), () => interactor.invoke());

    expect(result.data.customerPortalUrl).toBe(PORTAL_URL);
    expect(lemonSqueezyService.getSubscriptionOrThrowUnscoped).toHaveBeenCalledOnce();
  });

  it("gives the portal link to a system administrator", async () => {
    const { interactor } = make();

    const result = await runWithTenant(createMockUser(), () => interactor.invoke());

    expect(result.data.customerPortalUrl).toBe(PORTAL_URL);
  });
});
