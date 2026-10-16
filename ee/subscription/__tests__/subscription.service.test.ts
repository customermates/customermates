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

const { SubscriptionService } = await import("../subscription.service");
const { offerToVariant, variantToOffer } = await import("../lemon-squeezy-bindings");
const { getCommercialOfferOrThrow } = await import("@/core/commercial/plan-catalog");
const { lemonSqueezySubscriptionAttributes } = await import("@/tests/helpers/lemonsqueezy-subscription");

function makeRepo(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    findWorkspacePlanUnscoped: vi.fn(),
    upsertSubscriptionUnscoped: vi.fn().mockResolvedValue(undefined),
    findCompanyIdBySubscriptionIdUnscoped: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
}

function providerSubscription(attributes: Record<string, unknown>) {
  return { error: null, data: { data: { id: "sub-1", attributes } } };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("commercial offer bindings", () => {
  it("maps current variants to their catalog offers", () => {
    expect(variantToOffer("2001")?.plan).toBe("starter");
    expect(variantToOffer("2002")?.plan).toBe("pro");
    expect(variantToOffer("2003")?.plan).toBe("business");
    expect(variantToOffer("does-not-exist")).toBeNull();
  });

  it("resolves each purchasable monthly offer to its configured variant", () => {
    expect(offerToVariant(getCommercialOfferOrThrow("starter", "monthly"))).toBe("2001");
    expect(offerToVariant(getCommercialOfferOrThrow("pro", "monthly"))).toBe("2002");
    expect(offerToVariant(getCommercialOfferOrThrow("business", "monthly"))).toBe("2003");
  });
});

describe("SubscriptionService.createCheckoutOrThrow", () => {
  it("locks checkout to the selected monthly variant and skips the provider trial", async () => {
    const service = new SubscriptionService(makeRepo() as never);
    mockCreateCheckout.mockResolvedValue({
      error: null,
      data: { data: { attributes: { url: "https://checkout.example.com" } } },
    });

    await service.createCheckoutOrThrow({
      offer: getCommercialOfferOrThrow("pro", "monthly"),
      quantity: 4,
      redirectUrl: "https://customermates.example/settings/billing",
      custom: { company_id: "company-1" },
    });

    expect(mockCreateCheckout).toHaveBeenCalledWith("store-1", "2002", {
      checkoutData: {
        custom: { company_id: "company-1" },
        variantQuantities: [{ variantId: 2002, quantity: 4 }],
      },
      productOptions: {
        redirectUrl: "https://customermates.example/settings/billing",
        enabledVariants: [2002],
      },
      checkoutOptions: { skipTrial: true },
    });
  });
});

describe("SubscriptionService.syncSubscription", () => {
  it("upserts the base subscription columns and sets plan from the synced variant", async () => {
    const repo = makeRepo({
      findWorkspacePlanUnscoped: vi.fn().mockResolvedValue({ plan: "pro" }),
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

    await service.syncSubscription("sub-1", "company-1");

    expect(repo.upsertSubscriptionUnscoped).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: "company-1",
        plan: "business",
        quantity: 5,
      }),
    );
  });

  it("reports the changed plan when the synced variant changes the stored plan", async () => {
    const repo = makeRepo({
      findWorkspacePlanUnscoped: vi.fn().mockResolvedValue({ plan: "business" }),
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

    const result = await service.syncSubscription("sub-1", "company-1");

    expect(result).toEqual({ companyId: "company-1", changedPlan: "pro" });
  });

  it("reports no plan change when the synced variant maps to the stored plan", async () => {
    const repo = makeRepo({
      findWorkspacePlanUnscoped: vi.fn().mockResolvedValue({ plan: "pro" }),
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

    const result = await service.syncSubscription("sub-1", "company-1");

    expect(repo.upsertSubscriptionUnscoped).toHaveBeenCalledTimes(1);
    expect(result?.changedPlan).toBeNull();
  });

  it("resolves the company id from the subscription id when none is passed", async () => {
    const repo = makeRepo({
      findWorkspacePlanUnscoped: vi.fn().mockResolvedValue({ plan: "pro" }),
      findCompanyIdBySubscriptionIdUnscoped: vi.fn().mockResolvedValue("resolved-company-id"),
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
          },
        },
      },
    });

    const result = await service.syncSubscription("sub-1");

    expect(repo.findCompanyIdBySubscriptionIdUnscoped).toHaveBeenCalledWith("sub-1");
    expect(repo.upsertSubscriptionUnscoped).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: "resolved-company-id" }),
    );
    expect(result?.companyId).toBe("resolved-company-id");
  });

  it("syncs the workspace the subscription is bound to and leaves another workspace the event names untouched", async () => {
    const repo = makeRepo({
      findWorkspacePlanUnscoped: vi.fn().mockResolvedValue({ plan: "business" }),
      findCompanyIdBySubscriptionIdUnscoped: vi.fn().mockResolvedValue("bound-company"),
    });
    const service = new SubscriptionService(repo as never);
    mockGetSubscription.mockResolvedValue(
      providerSubscription({ status: "past_due", renews_at: "2026-07-01T00:00:00.000000Z", variant_id: 2003 }),
    );

    const result = await service.syncSubscription("sub-1", "other-company");

    expect(result).toEqual({ companyId: "bound-company", changedPlan: null });
    expect(repo.findWorkspacePlanUnscoped).toHaveBeenCalledExactlyOnceWith("bound-company");
    expect(repo.upsertSubscriptionUnscoped).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ companyId: "bound-company", lemonSqueezyId: "sub-1", status: "pastDue" }),
    );
  });

  it("syncs nothing and asks the provider nothing when the workspace the event names does not exist", async () => {
    const repo = makeRepo({ findWorkspacePlanUnscoped: vi.fn().mockResolvedValue(null) });
    const service = new SubscriptionService(repo as never);

    const result = await service.syncSubscription("sub-1", "unknown-company");

    expect(result).toBeNull();
    expect(repo.findWorkspacePlanUnscoped).toHaveBeenCalledWith("unknown-company");
    expect(mockGetSubscription).not.toHaveBeenCalled();
    expect(repo.upsertSubscriptionUnscoped).not.toHaveBeenCalled();
  });

  it("syncs nothing for a subscription no workspace holds when the event names no workspace", async () => {
    const repo = makeRepo();
    const service = new SubscriptionService(repo as never);

    const result = await service.syncSubscription("sub-1");

    expect(result).toBeNull();
    expect(repo.findWorkspacePlanUnscoped).not.toHaveBeenCalled();
    expect(mockGetSubscription).not.toHaveBeenCalled();
    expect(repo.upsertSubscriptionUnscoped).not.toHaveBeenCalled();
  });

  it("reads every column from a real-shaped Business subscription of the provider", async () => {
    const repo = makeRepo({ findWorkspacePlanUnscoped: vi.fn().mockResolvedValue({ plan: "pro" }) });
    const service = new SubscriptionService(repo as never);
    const attributes = lemonSqueezySubscriptionAttributes({
      subscriptionId: "123456789",
      itemId: 987654321,
      storeId: 1,
      storeOrigin: "https://customermates.lemonsqueezy.com",
      variantId: 2003,
      variantName: "Business",
      quantity: 1,
      customer: { name: "Test Customer", email: "customer@example.invalid" },
      createdAt: new Date("2026-10-16T09:12:34.567Z"),
    });
    mockGetSubscription.mockResolvedValue({
      error: null,
      data: { data: { type: "subscriptions", id: "123456789", attributes } },
    });

    const result = await service.syncSubscription("123456789", "company-1");

    expect(attributes.renews_at).toBe("2026-11-16T09:12:34.000000Z");
    expect(repo.upsertSubscriptionUnscoped).toHaveBeenCalledExactlyOnceWith({
      companyId: "company-1",
      lemonSqueezyId: "123456789",
      lemonSqueezyVariantId: "2003",
      status: "active",
      plan: "business",
      quantity: 1,
      trialEndDate: undefined,
      currentPeriodEnd: new Date("2026-11-16T09:12:34.000Z"),
      checkoutStartedAt: null,
    });
    expect(result).toEqual({ companyId: "company-1", changedPlan: "business" });
  });

  it("settles a started checkout when the sync binds a subscription the workspace did not hold", async () => {
    const repo = makeRepo({
      findWorkspacePlanUnscoped: vi.fn().mockResolvedValue({ plan: "pro", lemonSqueezyId: null }),
    });
    const service = new SubscriptionService(repo as never);
    mockGetSubscription.mockResolvedValue(providerSubscription({ status: "past_due", variant_id: 2002 }));

    await service.syncSubscription("sub-1", "company-1");

    expect(repo.upsertSubscriptionUnscoped).toHaveBeenCalledWith(
      expect.objectContaining({ lemonSqueezyId: "sub-1", status: "pastDue", checkoutStartedAt: null }),
    );
  });

  it.each(["active", "on_trial"])(
    "settles a started checkout when the workspace's own subscription becomes %s",
    async (status) => {
      const repo = makeRepo({
        findWorkspacePlanUnscoped: vi.fn().mockResolvedValue({ plan: "pro", lemonSqueezyId: "sub-1" }),
        findCompanyIdBySubscriptionIdUnscoped: vi.fn().mockResolvedValue("company-1"),
      });
      const service = new SubscriptionService(repo as never);
      mockGetSubscription.mockResolvedValue(providerSubscription({ status, variant_id: 2002 }));

      await service.syncSubscription("sub-1");

      expect(repo.upsertSubscriptionUnscoped).toHaveBeenCalledWith(
        expect.objectContaining({ companyId: "company-1", checkoutStartedAt: null }),
      );
    },
  );

  it.each(["expired", "cancelled", "past_due", "unpaid"])(
    "keeps a started checkout when the workspace's own subscription syncs as %s",
    async (status) => {
      const repo = makeRepo({
        findWorkspacePlanUnscoped: vi.fn().mockResolvedValue({ plan: "pro", lemonSqueezyId: "sub-1" }),
        findCompanyIdBySubscriptionIdUnscoped: vi.fn().mockResolvedValue("company-1"),
      });
      const service = new SubscriptionService(repo as never);
      mockGetSubscription.mockResolvedValue(providerSubscription({ status, variant_id: 2002 }));

      await service.syncSubscription("sub-1");

      expect(repo.upsertSubscriptionUnscoped).toHaveBeenCalledOnce();
      expect(repo.upsertSubscriptionUnscoped.mock.calls[0][0].checkoutStartedAt).toBeUndefined();
    },
  );
});

describe("SubscriptionService.updateSubscriptionQuantityOrThrow", () => {
  it("passes no flags on quantity updates", async () => {
    const repo = makeRepo();
    const service = new SubscriptionService(repo as never);

    mockListSubscriptionItems.mockResolvedValue({
      error: null,
      data: { data: [{ id: "item-1" }] },
    });
    mockUpdateSubscriptionItem.mockResolvedValue({ error: null });

    await service.updateSubscriptionQuantityOrThrow("sub-1", 5);

    expect(mockUpdateSubscriptionItem).toHaveBeenCalledWith("item-1", {
      quantity: 5,
    });
  });
});
