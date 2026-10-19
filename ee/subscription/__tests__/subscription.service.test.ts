import { describe, it, expect, vi, beforeEach } from "vitest";

import { MOCK_ENV_MODULE } from "@/tests/helpers/interactor-test-setup";

const mockLemonSqueezySetup = vi.fn();
const mockCreateCheckout = vi.fn();
const mockGetSubscription = vi.fn();
const mockListSubscriptionItems = vi.fn();
const mockListSubscriptions = vi.fn();
const mockUpdateSubscriptionItem = vi.fn();

vi.mock("@lemonsqueezy/lemonsqueezy.js", () => ({
  lemonSqueezySetup: (...args: unknown[]) => mockLemonSqueezySetup(...args),
  createCheckout: (...args: unknown[]) => mockCreateCheckout(...args),
  getSubscription: (...args: unknown[]) => mockGetSubscription(...args),
  listSubscriptionItems: (...args: unknown[]) => mockListSubscriptionItems(...args),
  listSubscriptions: (...args: unknown[]) => mockListSubscriptions(...args),
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

function makeRepo(written = true) {
  return { writeSubscriptionUnscoped: vi.fn().mockResolvedValue(written) };
}

function providerSubscription(attributes: Record<string, unknown>) {
  return { error: null, data: { data: { id: "sub-1", attributes } } };
}

function syncedSubscription(attributes: Record<string, unknown>, id = "sub-1") {
  return { data: { id, attributes } } as never;
}

function workspace(overrides: { plan?: string; lemonSqueezyId?: string | null } = {}) {
  return { companyId: "company-1", plan: "pro", lemonSqueezyId: null, ...overrides } as never;
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
  it("locks checkout to the selected monthly variant, skips the provider trial and expires the link", async () => {
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
      expiresAt: new Date("2026-10-17T12:00:00.000Z"),
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
      expiresAt: "2026-10-17T12:00:00.000Z",
    });
    expect(mockCreateCheckout.mock.calls[0][2].productOptions).not.toHaveProperty("name");
    expect(mockCreateCheckout.mock.calls[0][2].checkoutData).not.toHaveProperty("email");
  });

  it("prefills the payer e-mail it is given", async () => {
    const service = new SubscriptionService(makeRepo() as never);
    mockCreateCheckout.mockResolvedValue({
      error: null,
      data: { data: { attributes: { url: "https://checkout.example.com" } } },
    });

    await service.createCheckoutOrThrow({
      offer: getCommercialOfferOrThrow("pro", "monthly"),
      quantity: 1,
      email: "admin@example.invalid",
      expiresAt: new Date("2026-10-17T12:00:00.000Z"),
    });

    expect(mockCreateCheckout.mock.calls[0][2].checkoutData).toMatchObject({ email: "admin@example.invalid" });
  });

  it("gives the checkout's product the name it is asked for", async () => {
    const service = new SubscriptionService(makeRepo() as never);
    mockCreateCheckout.mockResolvedValue({
      error: null,
      data: { data: { attributes: { url: "https://checkout.example.com" } } },
    });

    await service.createCheckoutOrThrow({
      offer: getCommercialOfferOrThrow("business", "monthly"),
      quantity: 1,
      productName: "Steuern 2026",
      redirectUrl: "https://customermates.example/settings/billing",
      expiresAt: new Date("2026-10-17T12:00:00.000Z"),
    });

    expect(mockCreateCheckout.mock.calls[0][2].productOptions).toEqual({
      name: "Steuern 2026",
      redirectUrl: "https://customermates.example/settings/billing",
      enabledVariants: [2003],
    });
  });
});

describe("SubscriptionService.getSubscriptionOrThrowUnscoped", () => {
  it("reads when the provider created the subscription", async () => {
    const service = new SubscriptionService(makeRepo() as never);
    mockGetSubscription.mockResolvedValue(
      providerSubscription({ status: "active", created_at: "2026-10-16T09:12:34.000000Z", variant_id: 2003 }),
    );

    const subscription = await service.getSubscriptionOrThrowUnscoped("sub-1");

    expect(subscription.data.attributes.created_at).toBe("2026-10-16T09:12:34.000000Z");
  });

  it("reads the payer's e-mail and both signed billing links of a real-shaped subscription", async () => {
    const service = new SubscriptionService(makeRepo() as never);
    const attributes = lemonSqueezySubscriptionAttributes({
      subscriptionId: "123456789",
      itemId: 987654321,
      storeId: 1,
      storeOrigin: "https://customermates.lemonsqueezy.com",
      variantId: 2003,
      variantName: "Business",
      quantity: 1,
      customer: { name: "Test Customer", email: "customer@example.invalid" },
    });
    mockGetSubscription.mockResolvedValue({
      error: null,
      data: { data: { type: "subscriptions", id: "123456789", attributes } },
    });

    const { user_email: payerEmail, urls } = (await service.getSubscriptionOrThrowUnscoped("123456789")).data
      .attributes;

    expect(payerEmail).toBe("customer@example.invalid");
    expect(urls?.customer_portal).toBe(attributes.urls.customer_portal);
    expect(urls?.update_payment_method).toBe(attributes.urls.update_payment_method);
    expect(new URL(urls?.update_payment_method ?? "").pathname).toBe("/subscription/123456789/payment-details");
  });
});

describe("SubscriptionService.syncSubscription", () => {
  it("writes the base subscription columns and sets plan from the synced variant", async () => {
    const repo = makeRepo();
    const service = new SubscriptionService(repo as never);

    await service.syncSubscription(
      workspace(),
      syncedSubscription({
        status: "active",
        renews_at: "2026-07-01T00:00:00.000Z",
        variant_id: 2003,
        first_subscription_item: { quantity: 5 },
      }),
    );

    expect(repo.writeSubscriptionUnscoped).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: "company-1",
        expectedLemonSqueezyId: null,
        lemonSqueezyId: "sub-1",
        plan: "business",
        quantity: 5,
      }),
    );
    expect(mockGetSubscription).not.toHaveBeenCalled();
  });

  it("reports the changed plan when the synced variant changes the stored plan", async () => {
    const service = new SubscriptionService(makeRepo() as never);

    const result = await service.syncSubscription(
      workspace({ plan: "business", lemonSqueezyId: "sub-1" }),
      syncedSubscription({ status: "active", renews_at: "2026-07-01T00:00:00.000Z", variant_id: 2002 }),
    );

    expect(result).toEqual({ companyId: "company-1", changedPlan: "pro" });
  });

  it("reports no plan change when the synced variant maps to the stored plan", async () => {
    const repo = makeRepo();
    const service = new SubscriptionService(repo as never);

    const result = await service.syncSubscription(
      workspace({ lemonSqueezyId: "sub-1" }),
      syncedSubscription({ status: "active", renews_at: "2026-07-01T00:00:00.000Z", variant_id: 2002 }),
    );

    expect(repo.writeSubscriptionUnscoped).toHaveBeenCalledTimes(1);
    expect(result?.changedPlan).toBeNull();
  });

  it("writes only while the workspace still holds the binding the caller decided on", async () => {
    const repo = makeRepo(false);
    const service = new SubscriptionService(repo as never);

    const result = await service.syncSubscription(
      workspace({ lemonSqueezyId: "sub-0" }),
      syncedSubscription({ status: "active", variant_id: 2002 }),
    );

    expect(repo.writeSubscriptionUnscoped).toHaveBeenCalledWith(
      expect.objectContaining({ expectedLemonSqueezyId: "sub-0", lemonSqueezyId: "sub-1" }),
    );
    expect(result).toBeNull();
  });

  it("reads every column from a real-shaped Business subscription of the provider", async () => {
    const repo = makeRepo();
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

    const result = await service.syncSubscription(
      workspace(),
      await service.getSubscriptionOrThrowUnscoped("123456789"),
    );

    expect(attributes.renews_at).toBe("2026-11-16T09:12:34.000000Z");
    expect(repo.writeSubscriptionUnscoped).toHaveBeenCalledExactlyOnceWith({
      companyId: "company-1",
      expectedLemonSqueezyId: null,
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
    const repo = makeRepo();
    const service = new SubscriptionService(repo as never);

    await service.syncSubscription(workspace(), syncedSubscription({ status: "past_due", variant_id: 2002 }));

    expect(repo.writeSubscriptionUnscoped).toHaveBeenCalledWith(
      expect.objectContaining({ lemonSqueezyId: "sub-1", status: "pastDue", checkoutStartedAt: null }),
    );
  });

  it.each(["active", "on_trial"])(
    "settles a started checkout when the workspace's own subscription becomes %s",
    async (status) => {
      const repo = makeRepo();
      const service = new SubscriptionService(repo as never);

      await service.syncSubscription(
        workspace({ lemonSqueezyId: "sub-1" }),
        syncedSubscription({ status, variant_id: 2002 }),
      );

      expect(repo.writeSubscriptionUnscoped).toHaveBeenCalledWith(
        expect.objectContaining({ companyId: "company-1", checkoutStartedAt: null }),
      );
    },
  );

  it.each(["paused", "unpaid"])(
    "stores a %s subscription as unpaid so the workspace is routed to billing",
    async (status) => {
      const repo = makeRepo();
      const service = new SubscriptionService(repo as never);

      await service.syncSubscription(
        workspace({ lemonSqueezyId: "sub-1" }),
        syncedSubscription({ status, trial_ends_at: null, variant_id: 2002 }),
      );

      expect(repo.writeSubscriptionUnscoped).toHaveBeenCalledWith(
        expect.objectContaining({ lemonSqueezyId: "sub-1", status: "unPaid", trialEndDate: undefined }),
      );
    },
  );

  it.each(["expired", "cancelled", "past_due", "paused", "unpaid"])(
    "keeps a started checkout when the workspace's own subscription syncs as %s",
    async (status) => {
      const repo = makeRepo();
      const service = new SubscriptionService(repo as never);

      await service.syncSubscription(
        workspace({ lemonSqueezyId: "sub-1" }),
        syncedSubscription({ status, variant_id: 2002 }),
      );

      expect(repo.writeSubscriptionUnscoped).toHaveBeenCalledOnce();
      expect(repo.writeSubscriptionUnscoped.mock.calls[0][0].checkoutStartedAt).toBeUndefined();
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

describe("listing a store's subscriptions by email", () => {
  function page(ids: string[], lastPage: number) {
    return {
      error: null,
      data: {
        meta: { page: { lastPage } },
        data: ids.map((id) => ({
          id,
          attributes: { status: "active", user_email: "owner@example.invalid" },
        })),
      },
    };
  }

  it("reads every page of the configured store for that email", async () => {
    mockListSubscriptions.mockResolvedValueOnce(page(["sub-1"], 2)).mockResolvedValueOnce(page(["sub-2"], 2));

    const listed = await new SubscriptionService(makeRepo() as never).listStoreSubscriptionsByEmailOrThrowUnscoped(
      "owner@example.invalid",
    );

    expect(listed.map((subscription) => subscription.data.id)).toEqual(["sub-1", "sub-2"]);
    expect(mockListSubscriptions).toHaveBeenNthCalledWith(1, {
      filter: { storeId: "store-1", userEmail: "owner@example.invalid" },
      page: { number: 1, size: 100 },
    });
    expect(mockListSubscriptions).toHaveBeenNthCalledWith(2, {
      filter: { storeId: "store-1", userEmail: "owner@example.invalid" },
      page: { number: 2, size: 100 },
    });
  });

  it("throws when Lemon Squeezy answers with an error", async () => {
    mockListSubscriptions.mockResolvedValue({
      error: { message: "Service unavailable" },
      data: null,
    });

    await expect(
      new SubscriptionService(makeRepo() as never).listStoreSubscriptionsByEmailOrThrowUnscoped(
        "owner@example.invalid",
      ),
    ).rejects.toThrow("Service unavailable");
  });
});
