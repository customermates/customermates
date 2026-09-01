import { describe, expect, it } from "vitest";

import { SubscriptionPlan, SubscriptionStatus } from "@/generated/prisma";
import { TRIAL_HOSTED_AI_CREDITS_PER_ACTIVE_USER } from "@/ee/subscription/entitlements";

import {
  agentCreditPeriodForAnchor,
  agentCreditsForStartedProviderCost,
  prorateAgentCreditsForSeat,
  resolveAgentCreditEntitlement,
} from "../agent-credit-policy";

const ACTIVE = SubscriptionStatus.active;
const NOW = new Date("2026-08-06T12:00:00.000Z");

function entitlement(overrides: Partial<Parameters<typeof resolveAgentCreditEntitlement>[0]> = {}) {
  return resolveAgentCreditEntitlement({
    appMode: "cloud",
    plan: SubscriptionPlan.pro,
    status: ACTIVE,
    trialEndDate: null,
    creditAnchorAt: new Date("2026-01-15T10:30:00.000Z"),
    enterpriseCreditsPerUser: null,
    activeSeatAt: new Date("2026-01-15T10:30:00.000Z"),
    now: NOW,
    ...overrides,
  });
}

describe("agent credit periods", () => {
  it("uses the billing-anniversary day instead of calendar months", () => {
    const period = agentCreditPeriodForAnchor(new Date("2026-01-15T10:30:00.000Z"), NOW);

    expect(period.start.toISOString()).toBe("2026-07-15T10:30:00.000Z");
    expect(period.resetAt.toISOString()).toBe("2026-08-15T10:30:00.000Z");
  });

  it("keeps a month-end anchor across short months and leap years", () => {
    const feb = agentCreditPeriodForAnchor(new Date("2024-01-31T08:00:00.000Z"), new Date("2024-02-29T12:00:00.000Z"));
    const march = agentCreditPeriodForAnchor(
      new Date("2024-01-31T08:00:00.000Z"),
      new Date("2024-03-30T12:00:00.000Z"),
    );

    expect(feb.start.toISOString()).toBe("2024-02-29T08:00:00.000Z");
    expect(feb.resetAt.toISOString()).toBe("2024-03-31T08:00:00.000Z");
    expect(march.start.toISOString()).toBe("2024-02-29T08:00:00.000Z");
    expect(march.resetAt.toISOString()).toBe("2024-03-31T08:00:00.000Z");
  });

  it("starts a new period exactly at the anniversary instant", () => {
    const period = agentCreditPeriodForAnchor(
      new Date("2026-01-31T08:00:00.000Z"),
      new Date("2026-03-31T08:00:00.000Z"),
    );

    expect(period.start.toISOString()).toBe("2026-03-31T08:00:00.000Z");
    expect(period.resetAt.toISOString()).toBe("2026-04-30T08:00:00.000Z");
  });
});

describe("agent credit entitlements", () => {
  it.each([
    [SubscriptionPlan.starter, 200],
    [SubscriptionPlan.pro, 500],
    [SubscriptionPlan.business, 1200],
  ])("grants %s plan credits", (plan, limit) => {
    expect(entitlement({ plan }).limit).toBe(limit);
  });

  it("gives every trial user the full Pro-sized allowance without seat proration", () => {
    const result = entitlement({
      plan: SubscriptionPlan.starter,
      status: SubscriptionStatus.trial,
      trialEndDate: new Date("2026-08-13T12:00:00.000Z"),
      activeSeatAt: new Date("2026-08-06T11:59:00.000Z"),
    });

    expect(result.limit).toBe(TRIAL_HOSTED_AI_CREDITS_PER_ACTIVE_USER);
    expect(result.blockedReason).toBeNull();
  });

  it("fails closed when Enterprise has no contracted figure", () => {
    const result = entitlement({ plan: SubscriptionPlan.enterprise });

    expect(result.limit).toBe(0);
    expect(result.blockedReason).toBe("enterprise_allowance_missing");
  });

  it("uses the finite Enterprise allowance", () => {
    expect(entitlement({ plan: SubscriptionPlan.enterprise, enterpriseCreditsPerUser: 3400 }).limit).toBe(3400);
  });

  it("applies signed current-period adjustments after seat proration", () => {
    expect(entitlement({ adjustmentCredits: 75 }).limit).toBe(575);
    expect(entitlement({ adjustmentCredits: -75 }).limit).toBe(425);
  });

  it("applies signed current-period adjustments to trial allowances", () => {
    const trial = {
      status: SubscriptionStatus.trial,
      trialEndDate: new Date("2026-08-13T12:00:00.000Z"),
    } as const;

    expect(entitlement({ ...trial, adjustmentCredits: 75 }).limit).toBe(575);
    expect(entitlement({ ...trial, adjustmentCredits: -75 }).limit).toBe(425);
  });

  it("does not let an adjustment bypass missing Enterprise configuration", () => {
    expect(entitlement({ plan: SubscriptionPlan.enterprise, adjustmentCredits: 75 })).toMatchObject({
      limit: 0,
      blockedReason: "enterprise_allowance_missing",
    });
  });

  it("fails closed for self-hosted, expired trials, and unusable subscriptions", () => {
    expect(entitlement({ appMode: "self-hosted" }).blockedReason).toBe("self_hosted");
    expect(entitlement({ status: SubscriptionStatus.expired }).blockedReason).toBe("subscription_unavailable");
    expect(
      entitlement({
        status: SubscriptionStatus.trial,
        trialEndDate: new Date("2026-08-05T12:00:00.000Z"),
      }).blockedReason,
    ).toBe("subscription_unavailable");
  });

  it("prorates newly activated paid seats to a whole credit", () => {
    const period = {
      start: new Date("2026-08-01T00:00:00.000Z"),
      resetAt: new Date("2026-09-01T00:00:00.000Z"),
    };

    expect(prorateAgentCreditsForSeat(500, new Date("2026-08-16T12:00:00.000Z"), period)).toBe(250);
    expect(prorateAgentCreditsForSeat(200, new Date("2026-08-31T23:59:00.000Z"), period)).toBe(1);
  });

  it("keeps whole-credit proration exact for a large finite Enterprise allowance", () => {
    const period = {
      start: new Date("2026-08-01T00:00:00.000Z"),
      resetAt: new Date("2026-09-01T00:00:00.000Z"),
    };
    const allowance = Number.MAX_SAFE_INTEGER;
    const activeSeatAt = new Date("2026-08-16T12:00:00.000Z");
    const periodMs = BigInt(period.resetAt.getTime() - period.start.getTime());
    const remainingMs = BigInt(period.resetAt.getTime() - activeSeatAt.getTime());
    const expected = Number((BigInt(allowance) * remainingMs + periodMs - 1n) / periodMs);

    expect(prorateAgentCreditsForSeat(allowance, activeSeatAt, period)).toBe(expected);
  });

  it("fails closed when an active paid seat has no usable activation timestamp", () => {
    expect(entitlement({ activeSeatAt: null })).toMatchObject({
      limit: 0,
      blockedReason: "subscription_unavailable",
    });
    expect(entitlement({ activeSeatAt: new Date("2026-08-06T12:00:01.000Z") })).toMatchObject({
      limit: 0,
      blockedReason: "subscription_unavailable",
    });
  });

  it("raises or clamps the current prorated ceiling when the plan changes", () => {
    const activeSeatAt = new Date("2026-07-31T10:30:00.000Z");
    const pro = entitlement({ plan: SubscriptionPlan.pro, activeSeatAt });
    const business = entitlement({ plan: SubscriptionPlan.business, activeSeatAt });
    const starter = entitlement({ plan: SubscriptionPlan.starter, activeSeatAt });

    expect(business.limit).toBeGreaterThan(pro.limit);
    expect(starter.limit).toBeLessThan(pro.limit);
  });
});

describe("agent credit settlement", () => {
  it("charges one credit for any started provider turn below one cent", () => {
    expect(agentCreditsForStartedProviderCost(0)).toBe(1);
    expect(agentCreditsForStartedProviderCost(999_999)).toBe(1);
  });

  it("rounds every started cent upward", () => {
    expect(agentCreditsForStartedProviderCost(1_000_000)).toBe(1);
    expect(agentCreditsForStartedProviderCost(1_000_001)).toBe(2);
    expect(agentCreditsForStartedProviderCost(9_999_999)).toBe(10);
  });
});

describe("agentCreditsForStartedProviderCost boundaries", () => {
  it.each([
    [0, 1],
    [1, 1],
    [999_999, 1],
    [1_000_000, 1],
    [1_000_001, 2],
    [1_999_999, 2],
    [2_000_000, 2],
    [2_000_001, 3],
  ])("charges %i microcents as %i credits", (cost, credits) => {
    expect(agentCreditsForStartedProviderCost(cost)).toBe(credits);
  });

  it.each([[-1], [1.5], [Number.NaN], [Number.POSITIVE_INFINITY]])("rejects %s", (cost) => {
    expect(() => agentCreditsForStartedProviderCost(cost)).toThrow();
  });
});

describe("agentCreditPeriodForAnchor month-end and leap-year anchors", () => {
  const period = (anchor: string, now: string) => agentCreditPeriodForAnchor(new Date(anchor), new Date(now));

  it("clamps a 31st anchor into February and restores it in March", () => {
    expect(period("2026-01-31T10:00:00.000Z", "2026-02-15T00:00:00.000Z")).toMatchObject({
      start: new Date("2026-01-31T10:00:00.000Z"),
      resetAt: new Date("2026-02-28T10:00:00.000Z"),
    });
    expect(period("2026-01-31T10:00:00.000Z", "2026-03-01T00:00:00.000Z")).toMatchObject({
      start: new Date("2026-02-28T10:00:00.000Z"),
      resetAt: new Date("2026-03-31T10:00:00.000Z"),
    });
  });

  it("uses February 29 in a leap year and February 28 otherwise", () => {
    expect(period("2024-01-31T10:00:00.000Z", "2024-02-29T11:00:00.000Z").start).toEqual(
      new Date("2024-02-29T10:00:00.000Z"),
    );
    expect(period("2023-01-31T10:00:00.000Z", "2023-03-01T00:00:00.000Z").start).toEqual(
      new Date("2023-02-28T10:00:00.000Z"),
    );
  });

  it("restores a leap-day anchor in the next leap year", () => {
    expect(period("2024-02-29T10:00:00.000Z", "2025-02-28T11:00:00.000Z").start).toEqual(
      new Date("2025-02-28T10:00:00.000Z"),
    );
    expect(period("2024-02-29T10:00:00.000Z", "2028-02-29T11:00:00.000Z").start).toEqual(
      new Date("2028-02-29T10:00:00.000Z"),
    );
  });

  it("flips exactly at the anniversary instant", () => {
    const anchor = "2026-01-15T10:00:00.000Z";
    expect(period(anchor, "2026-02-15T09:59:59.999Z").start).toEqual(new Date("2026-01-15T10:00:00.000Z"));
    expect(period(anchor, "2026-02-15T10:00:00.000Z").start).toEqual(new Date("2026-02-15T10:00:00.000Z"));
  });

  it("resets monthly even when the subscription bills annually", () => {
    const monthly = period("2026-01-15T10:00:00.000Z", "2026-07-20T00:00:00.000Z");
    expect(monthly.start).toEqual(new Date("2026-07-15T10:00:00.000Z"));
    expect(monthly.resetAt).toEqual(new Date("2026-08-15T10:00:00.000Z"));
  });
});
