import { describe, it, expect, vi, beforeEach } from "vitest";

import { MOCK_ENV_MODULE } from "@/tests/helpers/interactor-test-setup";

const mockLemonSqueezySetup = vi.fn();
const mockCreateCheckout = vi.fn();
const mockGetSubscription = vi.fn();
const mockListSubscriptionItems = vi.fn();
const mockUpdateSubscriptionItem = vi.fn();

vi.mock("@lemonsqueezy/lemonsqueezy.js", () => ({
  lemonSqueezySetup: (...args: unknown[]) => mockLemonSqueezySetup(...args),
  createCheckout: (...args: unknown[]) => mockCreateCheckout(...args),
  getSubscription: (...args: unknown[]) => mockGetSubscription(...args),
  listSubscriptionItems: (...args: unknown[]) => mockListSubscriptionItems(...args),
  updateSubscriptionItem: (...args: unknown[]) => mockUpdateSubscriptionItem(...args),
}));

vi.mock("@/env", () => ({
  env: {
    ...MOCK_ENV_MODULE.env,
    LEMONSQUEEZY_API_KEY: "test-api-key",
    LEMONSQUEEZY_STORE_ID: "store-1",
    LEMONSQUEEZY_VARIANT_ID_STARTER: "2001",
    LEMONSQUEEZY_VARIANT_ID_PRO: "2002",
    LEMONSQUEEZY_VARIANT_ID_BUSINESS: "2003",
  },
}));

const { variantToPlan, planToVariant, SubscriptionService } = await import("../subscription.service");

function makeRepo(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    getSubscriptionOrThrowUnscoped: vi.fn(),
    upsertSubscriptionUnscoped: vi.fn().mockResolvedValue(undefined),
    findCompanyIdBySubscriptionIdOrThrowUnscoped: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("variantToPlan", () => {
  it("maps the starter variant to starter", () => {
    expect(variantToPlan("2001")).toBe("starter");
  });

  it("maps the business variant to business", () => {
    expect(variantToPlan("2003")).toBe("business");
  });

  it("maps the pro variant to pro", () => {
    expect(variantToPlan("2002")).toBe("pro");
  });

  it("maps an unknown variant to null", () => {
    expect(variantToPlan("does-not-exist")).toBeNull();
  });
});

describe("planToVariant", () => {
  it("resolves each purchasable plan to its configured variant", () => {
    expect(planToVariant("starter")).toBe("2001");
    expect(planToVariant("pro")).toBe("2002");
    expect(planToVariant("business")).toBe("2003");
  });

  it("throws for enterprise, which has no purchasable variant", () => {
    expect(() => planToVariant("enterprise")).toThrow();
  });
});

describe("SubscriptionService.updateSubscriptionOrThrow", () => {
  it("upserts the base subscription columns and sets plan from the synced variant", async () => {
    const repo = makeRepo({
      getSubscriptionOrThrowUnscoped: vi.fn().mockResolvedValue({ plan: "pro" }),
    });
    const service = new SubscriptionService(repo as never);

    mockGetSubscription.mockResolvedValue({
      error: null,
      data: {
        data: {
          id: "sub-1",
          attributes: {
            status: "active",
            renews_at: "2026-07-01T00:00:00.000Z",
            variant_id: 2003,
            first_subscription_item: { quantity: 5 },
          },
        },
      },
    });

    await service.updateSubscriptionOrThrow("sub-1", "company-1");

    expect(repo.upsertSubscriptionUnscoped).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: "company-1", plan: "business", quantity: 5 }),
    );
  });

  it("reports the changed plan when the synced variant changes the stored plan", async () => {
    const repo = makeRepo({
      getSubscriptionOrThrowUnscoped: vi.fn().mockResolvedValue({ plan: "business" }),
    });
    const service = new SubscriptionService(repo as never);

    mockGetSubscription.mockResolvedValue({
      error: null,
      data: {
        data: {
          id: "sub-1",
          attributes: {
            status: "active",
            renews_at: "2026-07-01T00:00:00.000Z",
            variant_id: 2002,
            first_subscription_item: { quantity: 2 },
          },
        },
      },
    });

    const result = await service.updateSubscriptionOrThrow("sub-1", "company-1");

    expect(result).toEqual({ companyId: "company-1", changedPlan: "pro" });
  });

  it("reports no plan change when the synced variant maps to the stored plan", async () => {
    const repo = makeRepo({
      getSubscriptionOrThrowUnscoped: vi.fn().mockResolvedValue({ plan: "pro" }),
    });
    const service = new SubscriptionService(repo as never);

    mockGetSubscription.mockResolvedValue({
      error: null,
      data: {
        data: {
          id: "sub-1",
          attributes: {
            status: "active",
            renews_at: "2026-07-01T00:00:00.000Z",
            variant_id: 2002,
            first_subscription_item: { quantity: 2 },
          },
        },
      },
    });

    const result = await service.updateSubscriptionOrThrow("sub-1", "company-1");

    expect(repo.upsertSubscriptionUnscoped).toHaveBeenCalledTimes(1);
    expect(result.changedPlan).toBeNull();
  });

  it("resolves the company id from the subscription id when none is passed", async () => {
    const repo = makeRepo({
      getSubscriptionOrThrowUnscoped: vi.fn().mockResolvedValue({ plan: "pro" }),
      findCompanyIdBySubscriptionIdOrThrowUnscoped: vi.fn().mockResolvedValue("resolved-company-id"),
    });
    const service = new SubscriptionService(repo as never);

    mockGetSubscription.mockResolvedValue({
      error: null,
      data: {
        data: {
          id: "sub-1",
          attributes: { status: "active", renews_at: "2026-07-01T00:00:00.000Z", variant_id: 2002 },
        },
      },
    });

    const result = await service.updateSubscriptionOrThrow("sub-1");

    expect(repo.findCompanyIdBySubscriptionIdOrThrowUnscoped).toHaveBeenCalledWith("sub-1");
    expect(repo.upsertSubscriptionUnscoped).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: "resolved-company-id" }),
    );
    expect(result.companyId).toBe("resolved-company-id");
  });
});

describe("SubscriptionService.updateSubscriptionQuantityOrThrow", () => {
  it("passes no flags on quantity updates", async () => {
    const repo = makeRepo();
    const service = new SubscriptionService(repo as never);

    mockListSubscriptionItems.mockResolvedValue({ error: null, data: { data: [{ id: "item-1" }] } });
    mockUpdateSubscriptionItem.mockResolvedValue({ error: null });

    await service.updateSubscriptionQuantityOrThrow("sub-1", 5);

    expect(mockUpdateSubscriptionItem).toHaveBeenCalledWith("item-1", { quantity: 5 });
  });
});
