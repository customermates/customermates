import { beforeEach, describe, expect, it, vi } from "vitest";

import { MOCK_ENV_MODULE } from "@/tests/helpers/interactor-test-setup";

const COMPANY_ID = "00000000-0000-4000-8000-000000000001";
const WEBHOOK_SECRET = "test-webhook-secret";

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
    LEMONSQUEEZY_WEBHOOK_SECRET: WEBHOOK_SECRET,
  },
}));

const { SubscriptionService } = await import("../subscription.service");
const { offerToVariant, variantToOffer } = await import("../lemon-squeezy-bindings");
const { getCommercialOfferOrThrow } = await import("@/core/commercial/plan-catalog");
const { createCheckoutReservation } = await import("../checkout-reservation");
const { env: mockedEnv } = await import("@/env");

function makeRepo(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    getSubscriptionOrThrowUnscoped: vi.fn(),
    upsertSubscriptionUnscoped: vi.fn().mockResolvedValue(undefined),
    findCompanyIdBySubscriptionIdOrThrowUnscoped: vi.fn(),
    countActiveUsersUnscoped: vi.fn().mockResolvedValue(2),
    withSubscriptionLockUnscoped: vi.fn(async (_companyId: string, work: () => Promise<unknown>) => work()),
    ...overrides,
  };
}

function providerSubscriptionResult(attributes: Record<string, unknown>, id = "sub-1") {
  return {
    error: null,
    data: {
      data: {
        id,
        attributes: {
          updated_at: "2026-08-13T13:00:00.000Z",
          ...attributes,
        },
      },
    },
  };
}

function mockProviderSubscription(attributes: Record<string, unknown>, id = "sub-1") {
  mockGetSubscription.mockResolvedValue(providerSubscriptionResult(attributes, id));
}

function makeReservation(
  options: {
    plan?: "starter" | "pro" | "business";
    quantity?: number;
    expired?: boolean;
  } = {},
) {
  const plan = options.plan ?? "pro";
  const quantity = options.quantity ?? 2;
  return createCheckoutReservation({
    secret: WEBHOOK_SECRET,
    companyId: COMPANY_ID,
    offer: getCommercialOfferOrThrow(plan, "monthly"),
    quantity,
    checkoutExpiresAt: new Date(options.expired ? "2020-01-01T00:00:00.000Z" : "2099-01-01T00:00:00.000Z"),
    bindingExpiresAt: new Date(options.expired ? "2020-01-01T01:00:00.000Z" : "2099-01-01T01:00:00.000Z"),
  });
}

function makeInitialSubscription(marker: string) {
  return {
    updatedAt: new Date("2026-08-13T12:00:00.000Z"),
    plan: "starter",
    status: "trial",
    lemonSqueezyId: null,
    lemonSqueezyVariantId: marker,
    quantity: null,
    trialEndDate: null,
    currentPeriodEnd: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("variantToOffer", () => {
  it("maps every configured variant and rejects unknown mappings", () => {
    expect(variantToOffer("2001")?.id).toBe("starter:monthly");
    expect(variantToOffer("2002")?.id).toBe("pro:monthly");
    expect(variantToOffer("2003")?.id).toBe("business:monthly");
    expect(variantToOffer("9999")).toBeNull();
  });
});

describe("offerToVariant", () => {
  it("resolves each purchasable plan to its configured variant", () => {
    expect(offerToVariant(getCommercialOfferOrThrow("starter", "monthly"))).toBe("2001");
    expect(offerToVariant(getCommercialOfferOrThrow("pro", "monthly"))).toBe("2002");
    expect(offerToVariant(getCommercialOfferOrThrow("business", "monthly"))).toBe("2003");
  });
});

describe("SubscriptionService.createCheckoutOrThrow", () => {
  it("locks checkout to the selected variant, skips provider trial, and expires the URL", async () => {
    const repo = makeRepo();
    const service = new SubscriptionService(repo as never);
    const offer = getCommercialOfferOrThrow("business", "monthly");
    const expiresAt = new Date("2026-08-13T13:30:00.000Z");

    mockCreateCheckout.mockResolvedValue({
      error: null,
      data: {
        data: {
          attributes: { url: "https://checkout.example.com/session-1" },
        },
      },
    });

    await expect(
      service.createCheckoutOrThrow({
        offer,
        quantity: 4,
        custom: { company_id: "company-1" },
        redirectUrl: "https://preview.customermates.com/company/subscription",
        expiresAt,
      }),
    ).resolves.toMatchObject({
      data: {
        attributes: { url: "https://checkout.example.com/session-1" },
      },
    });

    expect(mockCreateCheckout).toHaveBeenCalledWith("store-1", "2003", {
      checkoutData: {
        custom: { company_id: "company-1" },
        variantQuantities: [{ variantId: 2003, quantity: 4 }],
      },
      productOptions: {
        redirectUrl: "https://preview.customermates.com/company/subscription",
        enabledVariants: [2003],
      },
      checkoutOptions: { skipTrial: true },
      expiresAt: "2026-08-13T13:30:00.000Z",
    });
  });

  it("rejects a non-positive checkout quantity before calling the provider", async () => {
    const repo = makeRepo();
    const service = new SubscriptionService(repo as never);

    await expect(
      service.createCheckoutOrThrow({
        offer: getCommercialOfferOrThrow("pro", "monthly"),
        quantity: 0,
        expiresAt: new Date("2026-08-13T13:30:00.000Z"),
      }),
    ).rejects.toThrow("positive integer");
    expect(mockCreateCheckout).not.toHaveBeenCalled();
  });
});

describe("SubscriptionService.updateSubscriptionOrThrow", () => {
  it("adopts an initial provider subscription only with the matching reservation and seat snapshot", async () => {
    const reservation = makeReservation({ plan: "business", quantity: 2 });
    const repo = makeRepo({
      getSubscriptionOrThrowUnscoped: vi.fn().mockResolvedValue(makeInitialSubscription(reservation.marker)),
      countActiveUsersUnscoped: vi.fn().mockResolvedValue(2),
    });
    const service = new SubscriptionService(repo as never);
    mockProviderSubscription({
      status: "active",
      renews_at: "2026-09-01T00:00:00.000Z",
      variant_id: 2003,
      first_subscription_item: { quantity: 2 },
    });

    await expect(service.updateSubscriptionOrThrow("sub-1", COMPANY_ID, reservation.token)).resolves.toEqual({
      companyId: COMPANY_ID,
      changedPlan: "business",
      disposition: "updated",
    });
    expect(repo.countActiveUsersUnscoped).toHaveBeenCalledWith(COMPANY_ID);
    expect(repo.upsertSubscriptionUnscoped).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: COMPANY_ID,
        lemonSqueezyId: "sub-1",
        lemonSqueezyVariantId: "2003",
        plan: "business",
        quantity: 2,
      }),
    );
  });

  it.each([
    {
      label: "missing checkout token",
      reservation: () => makeReservation(),
      token: (_reservation: ReturnType<typeof makeReservation>) => undefined,
      variantId: 2002,
      quantity: 2,
      activeUsers: 2,
    },
    {
      label: "tampered checkout token",
      reservation: () => makeReservation(),
      token: (_reservation: ReturnType<typeof makeReservation>) => "f".repeat(64),
      variantId: 2002,
      quantity: 2,
      activeUsers: 2,
    },
    {
      label: "expired checkout reservation",
      reservation: () => makeReservation({ expired: true }),
      token: (reservation: ReturnType<typeof makeReservation>) => reservation.token,
      variantId: 2002,
      quantity: 2,
      activeUsers: 2,
    },
    {
      label: "different provider offer",
      reservation: () => makeReservation({ plan: "pro" }),
      token: (reservation: ReturnType<typeof makeReservation>) => reservation.token,
      variantId: 2003,
      quantity: 2,
      activeUsers: 2,
    },
    {
      label: "different provider quantity",
      reservation: () => makeReservation({ quantity: 2 }),
      token: (reservation: ReturnType<typeof makeReservation>) => reservation.token,
      variantId: 2002,
      quantity: 3,
      activeUsers: 2,
    },
    {
      label: "active membership above the reserved quantity",
      reservation: () => makeReservation({ quantity: 2 }),
      token: (reservation: ReturnType<typeof makeReservation>) => reservation.token,
      variantId: 2002,
      quantity: 2,
      activeUsers: 3,
    },
  ])("ignores an initial binding with $label", async (testCase) => {
    const reservation = testCase.reservation();
    const repo = makeRepo({
      getSubscriptionOrThrowUnscoped: vi.fn().mockResolvedValue(makeInitialSubscription(reservation.marker)),
      countActiveUsersUnscoped: vi.fn().mockResolvedValue(testCase.activeUsers),
    });
    const service = new SubscriptionService(repo as never);
    mockProviderSubscription({
      status: "active",
      variant_id: testCase.variantId,
      first_subscription_item: { quantity: testCase.quantity },
    });

    await expect(service.updateSubscriptionOrThrow("sub-1", COMPANY_ID, testCase.token(reservation))).resolves.toEqual({
      companyId: COMPANY_ID,
      changedPlan: null,
      disposition: "ignored-untrusted-initial-binding",
    });
    expect(repo.upsertSubscriptionUnscoped).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: "variant",
      attributes: {
        status: "active",
        variant_id: null,
        first_subscription_item: { quantity: 2 },
      },
      error: "missing a variant ID; checkout binding will be retried",
    },
    {
      label: "seat quantity",
      attributes: {
        status: "active",
        variant_id: 2002,
        first_subscription_item: null,
      },
      error: "missing its seat quantity; checkout binding will be retried",
    },
  ])("leaves the reservation intact when the provider $label is temporarily missing", async ({ attributes, error }) => {
    const reservation = makeReservation();
    const initial = makeInitialSubscription(reservation.marker);
    const repo = makeRepo({
      getSubscriptionOrThrowUnscoped: vi.fn().mockResolvedValue(initial),
    });
    const service = new SubscriptionService(repo as never);
    mockProviderSubscription(attributes);

    await expect(service.updateSubscriptionOrThrow("sub-1", COMPANY_ID, reservation.token)).rejects.toThrow(error);
    expect(repo.upsertSubscriptionUnscoped).not.toHaveBeenCalled();
    expect(initial.lemonSqueezyVariantId).toBe(reservation.marker);
  });

  it("refetches provider state when the local snapshot changes before the lock", async () => {
    const staleLocal = {
      ...makeInitialSubscription("2002"),
      updatedAt: new Date("2026-08-13T12:00:00.000Z"),
      lemonSqueezyId: "sub-1",
      plan: "pro",
    };
    const latestLocal = {
      ...staleLocal,
      updatedAt: new Date("2026-08-13T12:01:00.000Z"),
      status: "active",
    };
    const getSubscriptionOrThrowUnscoped = vi.fn().mockResolvedValueOnce(staleLocal).mockResolvedValue(latestLocal);
    const repo = makeRepo({ getSubscriptionOrThrowUnscoped });
    const service = new SubscriptionService(repo as never);
    mockGetSubscription
      .mockResolvedValueOnce(
        providerSubscriptionResult({
          status: "active",
          variant_id: 2003,
          first_subscription_item: { quantity: 2 },
        }),
      )
      .mockResolvedValueOnce(
        providerSubscriptionResult({
          status: "active",
          variant_id: 2001,
          first_subscription_item: { quantity: 3 },
        }),
      );

    await expect(service.updateSubscriptionOrThrow("sub-1", COMPANY_ID)).resolves.toEqual({
      companyId: COMPANY_ID,
      changedPlan: "starter",
      disposition: "updated",
    });
    expect(mockGetSubscription).toHaveBeenCalledTimes(2);
    expect(repo.upsertSubscriptionUnscoped).toHaveBeenCalledTimes(1);
    expect(repo.upsertSubscriptionUnscoped).toHaveBeenCalledWith(
      expect.objectContaining({
        lemonSqueezyVariantId: "2001",
        plan: "starter",
        quantity: 3,
      }),
    );
  });

  it("accepts later events for an already bound subscription without a checkout token", async () => {
    const repo = makeRepo({
      getSubscriptionOrThrowUnscoped: vi.fn().mockResolvedValue({
        ...makeInitialSubscription("2002"),
        plan: "pro",
        status: "active",
        lemonSqueezyId: "sub-1",
      }),
    });
    const service = new SubscriptionService(repo as never);
    mockProviderSubscription({
      status: "active",
      variant_id: 2003,
      first_subscription_item: { quantity: 3 },
    });

    await expect(service.updateSubscriptionOrThrow("sub-1", COMPANY_ID)).resolves.toEqual({
      companyId: COMPANY_ID,
      changedPlan: "business",
      disposition: "updated",
    });
    expect(repo.upsertSubscriptionUnscoped).toHaveBeenCalledWith(
      expect.objectContaining({ lemonSqueezyId: "sub-1", plan: "business", quantity: 3 }),
    );
  });

  it("quarantines a usable bound subscription whose provider quantity is below active membership", async () => {
    const repo = makeRepo({
      getSubscriptionOrThrowUnscoped: vi.fn().mockResolvedValue({
        ...makeInitialSubscription("2002"),
        plan: "pro",
        status: "active",
        lemonSqueezyId: "sub-1",
        quantity: 3,
      }),
      countActiveUsersUnscoped: vi.fn().mockResolvedValue(3),
    });
    const service = new SubscriptionService(repo as never);
    mockProviderSubscription({
      status: "active",
      variant_id: 2002,
      first_subscription_item: { quantity: 2 },
    });

    await expect(service.updateSubscriptionOrThrow("sub-1", COMPANY_ID)).rejects.toThrow(
      "quantity 2 is below 3 active users; access was quarantined",
    );
    expect(repo.countActiveUsersUnscoped).toHaveBeenCalledWith(COMPANY_ID);
    expect(repo.upsertSubscriptionUnscoped).toHaveBeenCalledWith(
      expect.objectContaining({
        lemonSqueezyId: "sub-1",
        lemonSqueezyVariantId: "2002",
        plan: "pro",
        quantity: 2,
        status: "unPaid",
      }),
    );
  });

  it("quarantines a usable bound subscription with no provider quantity while preserving the last quantity", async () => {
    const repo = makeRepo({
      getSubscriptionOrThrowUnscoped: vi.fn().mockResolvedValue({
        ...makeInitialSubscription("2002"),
        plan: "pro",
        status: "active",
        lemonSqueezyId: "sub-1",
        quantity: 4,
      }),
      countActiveUsersUnscoped: vi.fn().mockResolvedValue(3),
    });
    const service = new SubscriptionService(repo as never);
    mockProviderSubscription({
      status: "active",
      variant_id: 2002,
      first_subscription_item: null,
    });

    await expect(service.updateSubscriptionOrThrow("sub-1", COMPANY_ID)).rejects.toThrow(
      "missing its seat quantity; access was quarantined",
    );
    expect(repo.upsertSubscriptionUnscoped).toHaveBeenCalledWith(
      expect.objectContaining({
        lemonSqueezyId: "sub-1",
        plan: "pro",
        quantity: 4,
        status: "unPaid",
      }),
    );
  });

  it("does not require a quantity for a terminal provider state", async () => {
    const repo = makeRepo({
      getSubscriptionOrThrowUnscoped: vi.fn().mockResolvedValue({
        ...makeInitialSubscription("2002"),
        plan: "pro",
        status: "active",
        lemonSqueezyId: "sub-1",
        quantity: 4,
      }),
    });
    const service = new SubscriptionService(repo as never);
    mockProviderSubscription({
      status: "expired",
      variant_id: 2002,
      first_subscription_item: null,
    });

    await expect(service.updateSubscriptionOrThrow("sub-1", COMPANY_ID)).resolves.toEqual({
      companyId: COMPANY_ID,
      changedPlan: null,
      disposition: "updated",
    });
    expect(repo.countActiveUsersUnscoped).not.toHaveBeenCalled();
    expect(repo.upsertSubscriptionUnscoped).toHaveBeenCalledWith(expect.objectContaining({ status: "expired" }));
  });

  it("upserts provider state and reports the synchronized plan", async () => {
    const repo = makeRepo({
      getSubscriptionOrThrowUnscoped: vi.fn().mockResolvedValue({
        plan: "pro",
        status: "active",
        lemonSqueezyId: "sub-1",
      }),
    });
    const service = new SubscriptionService(repo as never);
    mockProviderSubscription({
      status: "active",
      renews_at: "2026-09-01T00:00:00.000Z",
      variant_id: 2003,
      first_subscription_item: { quantity: 2 },
    });

    await expect(service.updateSubscriptionOrThrow("sub-1", "company-1")).resolves.toEqual({
      companyId: "company-1",
      changedPlan: "business",
      disposition: "updated",
    });
    expect(repo.withSubscriptionLockUnscoped).toHaveBeenCalledWith("company-1", expect.any(Function));
    expect(repo.upsertSubscriptionUnscoped).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: "company-1",
        lemonSqueezyId: "sub-1",
        plan: "business",
        quantity: 2,
      }),
    );
  });

  it("reports no plan change when the stored plan already matches", async () => {
    const repo = makeRepo({
      getSubscriptionOrThrowUnscoped: vi.fn().mockResolvedValue({
        plan: "pro",
        status: "active",
        lemonSqueezyId: "sub-1",
      }),
    });
    const service = new SubscriptionService(repo as never);
    mockProviderSubscription({
      status: "active",
      renews_at: "2026-09-01T00:00:00.000Z",
      variant_id: 2002,
      first_subscription_item: { quantity: 2 },
    });

    await expect(service.updateSubscriptionOrThrow("sub-1", "company-1")).resolves.toEqual({
      companyId: "company-1",
      changedPlan: null,
      disposition: "updated",
    });
  });

  it("resolves the company id from the subscription id when none is passed", async () => {
    const repo = makeRepo({
      getSubscriptionOrThrowUnscoped: vi.fn().mockResolvedValue({
        plan: "pro",
        status: "active",
        lemonSqueezyId: "sub-1",
      }),
      findCompanyIdBySubscriptionIdOrThrowUnscoped: vi.fn().mockResolvedValue("resolved-company-id"),
    });
    const service = new SubscriptionService(repo as never);
    mockProviderSubscription({
      status: "active",
      renews_at: "2026-09-01T00:00:00.000Z",
      variant_id: 2002,
      first_subscription_item: { quantity: 2 },
    });

    const result = await service.updateSubscriptionOrThrow("sub-1");

    expect(repo.findCompanyIdBySubscriptionIdOrThrowUnscoped).toHaveBeenCalledWith("sub-1");
    expect(repo.withSubscriptionLockUnscoped).toHaveBeenCalledWith("resolved-company-id", expect.any(Function));
    expect(result).toEqual({
      companyId: "resolved-company-id",
      changedPlan: null,
      disposition: "updated",
    });
  });

  it("quarantines an unknown provider variant before surfacing the sync error", async () => {
    const repo = makeRepo({
      getSubscriptionOrThrowUnscoped: vi.fn().mockResolvedValue({
        plan: "business",
        status: "active",
        lemonSqueezyId: "sub-1",
      }),
    });
    const service = new SubscriptionService(repo as never);
    mockProviderSubscription({
      status: "active",
      variant_id: 9999,
      first_subscription_item: { quantity: 2 },
    });

    await expect(service.updateSubscriptionOrThrow("sub-1", "company-1")).rejects.toThrow(
      "Unknown Lemon Squeezy variant",
    );
    expect(repo.upsertSubscriptionUnscoped).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: "company-1",
        lemonSqueezyVariantId: "9999",
        plan: "business",
        status: "unPaid",
      }),
    );
    expect(mockUpdateSubscriptionItem).not.toHaveBeenCalled();
  });

  it("quarantines a provider subscription whose variant is missing", async () => {
    const repo = makeRepo({
      getSubscriptionOrThrowUnscoped: vi.fn().mockResolvedValue({
        plan: "business",
        status: "active",
        lemonSqueezyId: "sub-1",
      }),
    });
    const service = new SubscriptionService(repo as never);
    mockProviderSubscription({ status: "active", variant_id: null });

    await expect(service.updateSubscriptionOrThrow("sub-1", "company-1")).rejects.toThrow("missing a variant ID");
    expect(repo.upsertSubscriptionUnscoped).toHaveBeenCalledWith(
      expect.objectContaining({ plan: "business", status: "unPaid" }),
    );
  });

  it("quarantines access while preserving a binding configuration error", async () => {
    const repo = makeRepo({
      getSubscriptionOrThrowUnscoped: vi.fn().mockResolvedValue({
        plan: "business",
        status: "active",
        lemonSqueezyId: "sub-1",
      }),
    });
    const service = new SubscriptionService(repo as never);
    mockProviderSubscription({ status: "active", variant_id: 2003 });
    const mutableEnv = mockedEnv as typeof mockedEnv & {
      LEMONSQUEEZY_VARIANT_ID_PRO: string | undefined;
    };
    const original = mutableEnv.LEMONSQUEEZY_VARIANT_ID_PRO;
    mutableEnv.LEMONSQUEEZY_VARIANT_ID_PRO = undefined;

    try {
      await expect(service.updateSubscriptionOrThrow("sub-1", "company-1")).rejects.toThrow(
        "LEMONSQUEEZY_VARIANT_ID_PRO is not configured",
      );
    } finally {
      mutableEnv.LEMONSQUEEZY_VARIANT_ID_PRO = original;
    }

    expect(repo.upsertSubscriptionUnscoped).toHaveBeenCalledWith(
      expect.objectContaining({ plan: "business", status: "unPaid" }),
    );
  });

  it("quarantines an unsupported provider status", async () => {
    const repo = makeRepo({
      getSubscriptionOrThrowUnscoped: vi.fn().mockResolvedValue({
        plan: "business",
        status: "active",
        lemonSqueezyId: "sub-1",
      }),
    });
    const service = new SubscriptionService(repo as never);
    mockProviderSubscription({
      status: "new_provider_status",
      variant_id: 2003,
      first_subscription_item: { quantity: 2 },
    });

    await expect(service.updateSubscriptionOrThrow("sub-1", "company-1")).rejects.toThrow(
      "Unsupported Lemon Squeezy subscription status",
    );
    expect(repo.upsertSubscriptionUnscoped).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: "company-1",
        plan: "business",
        status: "unPaid",
      }),
    );
  });

  it("maps a paused provider subscription to unpaid", async () => {
    const repo = makeRepo({
      getSubscriptionOrThrowUnscoped: vi.fn().mockResolvedValue({
        plan: "pro",
        status: "active",
        lemonSqueezyId: "sub-1",
      }),
    });
    const service = new SubscriptionService(repo as never);
    mockProviderSubscription({
      status: "paused",
      variant_id: 2002,
      first_subscription_item: { quantity: 1 },
    });

    await expect(service.updateSubscriptionOrThrow("sub-1", "company-1")).resolves.toEqual({
      companyId: "company-1",
      changedPlan: null,
      disposition: "updated",
    });
    expect(repo.upsertSubscriptionUnscoped).toHaveBeenCalledWith(
      expect.objectContaining({ status: "unPaid", plan: "pro" }),
    );
    expect(mockListSubscriptionItems).not.toHaveBeenCalled();
  });

  it("treats events for a different provider subscription identity as a successful no-op", async () => {
    const repo = makeRepo({
      getSubscriptionOrThrowUnscoped: vi.fn().mockResolvedValue({
        plan: "business",
        status: "active",
        lemonSqueezyId: "sub-new",
      }),
    });
    const service = new SubscriptionService(repo as never);

    for (const status of ["expired", "active"]) {
      mockProviderSubscription(
        {
          status,
          variant_id: 2002,
          first_subscription_item: { quantity: 2 },
        },
        "sub-old",
      );

      await expect(service.updateSubscriptionOrThrow("sub-old", "company-1")).resolves.toEqual({
        companyId: "company-1",
        changedPlan: null,
        disposition: "ignored-provider-id-mismatch",
      });
    }

    expect(repo.upsertSubscriptionUnscoped).not.toHaveBeenCalled();
  });

  it("does not replace a terminal subscription with an unusable incoming subscription", async () => {
    const repo = makeRepo({
      getSubscriptionOrThrowUnscoped: vi.fn().mockResolvedValue({
        plan: "starter",
        status: "expired",
        lemonSqueezyId: "sub-old",
      }),
    });
    const service = new SubscriptionService(repo as never);
    mockProviderSubscription(
      {
        status: "expired",
        variant_id: 2002,
        first_subscription_item: { quantity: 2 },
      },
      "sub-new",
    );

    await expect(service.updateSubscriptionOrThrow("sub-new", "company-1")).resolves.toEqual({
      companyId: "company-1",
      changedPlan: null,
      disposition: "ignored-provider-id-mismatch",
    });
    expect(repo.upsertSubscriptionUnscoped).not.toHaveBeenCalled();
  });

  it("does not replace an expired provider identity with a different usable subscription", async () => {
    const repo = makeRepo({
      getSubscriptionOrThrowUnscoped: vi.fn().mockResolvedValue({
        plan: "starter",
        status: "expired",
        lemonSqueezyId: "sub-old",
      }),
    });
    const service = new SubscriptionService(repo as never);
    mockProviderSubscription(
      {
        status: "active",
        variant_id: 2002,
        first_subscription_item: { quantity: 2 },
      },
      "sub-new",
    );

    await expect(service.updateSubscriptionOrThrow("sub-new", "company-1")).resolves.toEqual({
      companyId: "company-1",
      changedPlan: null,
      disposition: "ignored-provider-id-mismatch",
    });
    expect(repo.upsertSubscriptionUnscoped).not.toHaveBeenCalled();
  });

  it("does not mutate provider quantity inline during a subscription sync", async () => {
    const repo = makeRepo({
      getSubscriptionOrThrowUnscoped: vi.fn().mockResolvedValue({
        plan: "pro",
        status: "active",
        lemonSqueezyId: "sub-1",
      }),
    });
    const service = new SubscriptionService(repo as never);
    mockProviderSubscription({
      status: "active",
      renews_at: "2026-09-01T00:00:00.000Z",
      variant_id: 2002,
      first_subscription_item: { quantity: 2 },
    });
    await service.updateSubscriptionOrThrow("sub-1", "company-1");

    expect(mockListSubscriptionItems).not.toHaveBeenCalled();
    expect(mockUpdateSubscriptionItem).not.toHaveBeenCalled();
  });

  it("rejects a provider response for a different requested subscription identity", async () => {
    const repo = makeRepo({
      getSubscriptionOrThrowUnscoped: vi.fn().mockResolvedValue({
        ...makeInitialSubscription("2002"),
        lemonSqueezyId: "sub-request",
      }),
    });
    const service = new SubscriptionService(repo as never);
    mockProviderSubscription(
      {
        status: "active",
        variant_id: 2002,
      },
      "sub-response",
    );

    await expect(service.updateSubscriptionOrThrow("sub-request", "company-1")).rejects.toThrow("identity mismatch");
    expect(repo.withSubscriptionLockUnscoped).not.toHaveBeenCalled();
    expect(repo.upsertSubscriptionUnscoped).not.toHaveBeenCalled();
  });

  it("persists missing provider period boundaries as explicit null values", async () => {
    const repo = makeRepo({
      getSubscriptionOrThrowUnscoped: vi.fn().mockResolvedValue({
        plan: "pro",
        status: "active",
        lemonSqueezyId: "sub-1",
      }),
    });
    const service = new SubscriptionService(repo as never);
    mockProviderSubscription({
      status: "cancelled",
      renews_at: null,
      ends_at: null,
      trial_ends_at: null,
      variant_id: 2002,
    });

    await service.updateSubscriptionOrThrow("sub-1", "company-1");

    expect(repo.upsertSubscriptionUnscoped).toHaveBeenCalledWith(
      expect.objectContaining({
        trialEndDate: null,
        currentPeriodEnd: null,
      }),
    );
  });
});

describe("SubscriptionService.updateSubscriptionQuantityOrThrow", () => {
  it("passes no invoice flag for ordinary quantity updates", async () => {
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
