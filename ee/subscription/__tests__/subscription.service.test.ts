import { describe, it, expect, vi, beforeEach } from "vitest";

import { MOCK_ENV_MODULE } from "@/tests/helpers/interactor-test-setup";
import { agentCreditPeriodForAnchor } from "@/features/agent-chat/agent-credit-policy";

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

const {
  variantToPlan,
  planToVariant,
  lemonSqueezyStatusToSubscriptionStatus,
  deriveAgentCreditAnchorFromLemonSqueezy,
  SubscriptionService,
} = await import("../subscription.service");

function makeRepo(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    withSubscriptionCompanyLockUnscoped: vi.fn(async (_companyId: string, fn: () => Promise<unknown>) => fn()),
    getSubscriptionOrThrowUnscoped: vi.fn(),
    upsertSubscriptionUnscoped: vi.fn().mockResolvedValue(undefined),
    findCompanyIdBySubscriptionIdOrThrowUnscoped: vi.fn(),
    ...overrides,
  };
}

function lemonSubscription(attributes: Record<string, unknown> = {}) {
  return {
    error: null,
    data: {
      data: {
        id: "sub-1",
        attributes: {
          status: "active",
          billing_anchor: 1,
          renews_at: "2026-09-01T00:00:00.000Z",
          updated_at: "2026-08-01T00:00:00.000Z",
          variant_id: 2002,
          ...attributes,
        },
      },
    },
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

describe("lemonSqueezyStatusToSubscriptionStatus", () => {
  it("maps a paused subscription to an unavailable status", () => {
    expect(lemonSqueezyStatusToSubscriptionStatus("paused")).toBe("expired");
  });

  it("fails closed if Lemon Squeezy returns a status outside the validated response contract", () => {
    expect(lemonSqueezyStatusToSubscriptionStatus("future_provider_status")).toBe("expired");
  });
});

describe("SubscriptionService.updateSubscriptionOrThrow", () => {
  it("derives an annual trial-to-paid anchor from provider time despite delayed processing", async () => {
    const convertedAt = new Date("2026-08-06T10:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-20T12:00:00.000Z"));
    const repo = makeRepo({
      getSubscriptionOrThrowUnscoped: vi.fn().mockResolvedValue({
        status: "trial",
        plan: "pro",
        agentCreditAnchorAt: new Date("2026-07-01T00:00:00.000Z"),
        createdAt: new Date("2026-07-01T00:00:00.000Z"),
      }),
    });
    const service = new SubscriptionService(repo as never);
    mockGetSubscription.mockResolvedValue(
      lemonSubscription({
        billing_anchor: 6,
        renews_at: "2027-08-06T10:00:00.000Z",
        updated_at: convertedAt.toISOString(),
      }),
    );

    try {
      await service.updateSubscriptionOrThrow("sub-1", "company-1");
    } finally {
      vi.useRealTimers();
    }

    expect(repo.upsertSubscriptionUnscoped).toHaveBeenCalledWith(
      expect.objectContaining({ agentCreditAnchorAt: convertedAt }),
    );
    expect(repo.withSubscriptionCompanyLockUnscoped).toHaveBeenCalledWith("company-1", expect.any(Function));

    const period = agentCreditPeriodForAnchor(convertedAt, new Date("2026-09-20T12:00:00.000Z"));
    expect(period).toEqual({
      start: new Date("2026-09-06T10:00:00.000Z"),
      resetAt: new Date("2026-10-06T10:00:00.000Z"),
    });
  });

  it("preserves the first paid anchor when a delayed provider replay has a later update time", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-20T12:00:00.000Z"));
    const paidAnchor = new Date("2026-08-06T10:00:00.000Z");
    const getExisting = vi
      .fn()
      .mockResolvedValueOnce({
        status: "trial",
        plan: "pro",
        agentCreditAnchorAt: new Date("2026-07-01T00:00:00.000Z"),
        createdAt: new Date("2026-07-01T00:00:00.000Z"),
      })
      .mockResolvedValueOnce({
        status: "active",
        plan: "pro",
        agentCreditAnchorAt: paidAnchor,
        createdAt: new Date("2026-07-01T00:00:00.000Z"),
      });
    const repo = makeRepo({ getSubscriptionOrThrowUnscoped: getExisting });
    const service = new SubscriptionService(repo as never);
    mockGetSubscription
      .mockResolvedValueOnce(
        lemonSubscription({
          billing_anchor: 6,
          renews_at: "2027-08-06T10:00:00.000Z",
          updated_at: paidAnchor.toISOString(),
        }),
      )
      .mockResolvedValueOnce(
        lemonSubscription({
          billing_anchor: 6,
          renews_at: "2027-08-06T10:00:00.000Z",
          updated_at: "2026-11-12T15:30:00.000Z",
        }),
      );

    try {
      await service.updateSubscriptionOrThrow("sub-1", "company-1");
      vi.setSystemTime(new Date("2026-12-20T12:00:00.000Z"));
      await service.updateSubscriptionOrThrow("sub-1", "company-1");
    } finally {
      vi.useRealTimers();
    }

    expect(repo.upsertSubscriptionUnscoped).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ agentCreditAnchorAt: paidAnchor }),
    );
    expect(repo.upsertSubscriptionUnscoped).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ agentCreditAnchorAt: paidAnchor }),
    );
  });

  it("keeps the monthly credit anchor when an active plan changes", async () => {
    const anchor = new Date("2026-01-31T08:00:00.000Z");
    const repo = makeRepo({
      getSubscriptionOrThrowUnscoped: vi.fn().mockResolvedValue({
        status: "active",
        plan: "pro",
        agentCreditAnchorAt: anchor,
        createdAt: new Date("2025-12-01T00:00:00.000Z"),
      }),
    });
    const service = new SubscriptionService(repo as never);
    mockGetSubscription.mockResolvedValue(
      lemonSubscription({
        billing_anchor: 31,
        renews_at: "2027-01-31T08:00:00.000Z",
        updated_at: "2026-08-01T00:00:00.000Z",
        variant_id: 2003,
      }),
    );

    await service.updateSubscriptionOrThrow("sub-1", "company-1");

    expect(repo.upsertSubscriptionUnscoped).toHaveBeenCalledWith(
      expect.objectContaining({ plan: "business", agentCreditAnchorAt: anchor }),
    );
  });

  it("upserts the base subscription columns and sets plan from the synced variant", async () => {
    const repo = makeRepo({
      getSubscriptionOrThrowUnscoped: vi.fn().mockResolvedValue({ plan: "pro" }),
    });
    const service = new SubscriptionService(repo as never);

    mockGetSubscription.mockResolvedValue(
      lemonSubscription({
        renews_at: "2026-07-01T00:00:00.000Z",
        updated_at: "2026-06-01T00:00:00.000Z",
        variant_id: 2003,
        first_subscription_item: { quantity: 5 },
      }),
    );

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

    mockGetSubscription.mockResolvedValue(
      lemonSubscription({
        renews_at: "2026-07-01T00:00:00.000Z",
        updated_at: "2026-06-01T00:00:00.000Z",
        variant_id: 2002,
        first_subscription_item: { quantity: 2 },
      }),
    );

    const result = await service.updateSubscriptionOrThrow("sub-1", "company-1");

    expect(result).toEqual({ companyId: "company-1", changedPlan: "pro" });
  });

  it("reports no plan change when the synced variant maps to the stored plan", async () => {
    const repo = makeRepo({
      getSubscriptionOrThrowUnscoped: vi.fn().mockResolvedValue({ plan: "pro" }),
    });
    const service = new SubscriptionService(repo as never);

    mockGetSubscription.mockResolvedValue(
      lemonSubscription({
        renews_at: "2026-07-01T00:00:00.000Z",
        updated_at: "2026-06-01T00:00:00.000Z",
        variant_id: 2002,
        first_subscription_item: { quantity: 2 },
      }),
    );

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

    mockGetSubscription.mockResolvedValue(
      lemonSubscription({
        renews_at: "2026-07-01T00:00:00.000Z",
        updated_at: "2026-06-01T00:00:00.000Z",
      }),
    );

    const result = await service.updateSubscriptionOrThrow("sub-1");

    expect(repo.findCompanyIdBySubscriptionIdOrThrowUnscoped).toHaveBeenCalledWith("sub-1");
    expect(repo.upsertSubscriptionUnscoped).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: "resolved-company-id" }),
    );
    expect(result.companyId).toBe("resolved-company-id");
  });
});

describe("deriveAgentCreditAnchorFromLemonSqueezy", () => {
  it("derives the same monthly credit schedule for monthly and annual subscriptions", () => {
    const providerUpdatedAt = new Date("2026-08-06T10:00:00.000Z");
    const now = new Date("2026-10-20T12:00:00.000Z");
    const monthly = deriveAgentCreditAnchorFromLemonSqueezy({
      billingAnchor: 6,
      renewsAt: new Date("2026-09-06T10:00:00.000Z"),
      providerUpdatedAt,
      now,
    });
    const annual = deriveAgentCreditAnchorFromLemonSqueezy({
      billingAnchor: 6,
      renewsAt: new Date("2027-08-06T10:00:00.000Z"),
      providerUpdatedAt,
      now,
    });

    expect(monthly).toEqual(providerUpdatedAt);
    expect(annual).toEqual(providerUpdatedAt);
    expect(agentCreditPeriodForAnchor(annual, new Date("2026-09-20T12:00:00.000Z"))).toEqual({
      start: new Date("2026-09-06T10:00:00.000Z"),
      resetAt: new Date("2026-10-06T10:00:00.000Z"),
    });
  });

  it("retains a 31st billing anchor through a leap-February renewal", () => {
    const anchor = deriveAgentCreditAnchorFromLemonSqueezy({
      billingAnchor: 31,
      renewsAt: new Date("2025-02-28T08:00:00.000Z"),
      providerUpdatedAt: new Date("2024-02-29T08:00:00.000Z"),
      now: new Date("2024-03-05T12:00:00.000Z"),
    });

    expect(anchor.toISOString()).toBe("2024-01-31T08:00:00.000Z");
    expect(agentCreditPeriodForAnchor(anchor, new Date("2024-02-29T12:00:00.000Z"))).toEqual({
      start: new Date("2024-02-29T08:00:00.000Z"),
      resetAt: new Date("2024-03-31T08:00:00.000Z"),
    });
  });

  it("never returns a future anchor when the provider clock is ahead", () => {
    const now = new Date("2026-08-30T12:00:00.000Z");
    const anchor = deriveAgentCreditAnchorFromLemonSqueezy({
      billingAnchor: 31,
      renewsAt: new Date("2026-09-30T08:00:00.000Z"),
      providerUpdatedAt: new Date("2026-09-30T08:00:00.000Z"),
      now,
    });

    expect(anchor.toISOString()).toBe("2026-07-31T08:00:00.000Z");
    expect(anchor.getTime()).toBeLessThanOrEqual(now.getTime());
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
