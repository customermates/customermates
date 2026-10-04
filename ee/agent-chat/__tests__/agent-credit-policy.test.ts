import { describe, expect, it } from "vitest";

import { SubscriptionPlan, SubscriptionStatus } from "@/generated/prisma";
import { TRIAL_HOSTED_AI_CREDITS_PER_ACTIVE_USER } from "@/ee/subscription/entitlements";

import {
  agentCreditPeriodForAnchor,
  agentMicrocentsFromStorage,
  agentUsageMultiplier,
  memberCreditHeadroomMicrocents,
  prorateAgentAllowanceForSeat,
  resolveAgentCreditEntitlement,
  workspaceAgentCreditRate,
  workspaceIndexingShareMicrocents,
} from "../agent-credit-policy";

const CREDIT = 1_000_000;
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
    [SubscriptionPlan.starter, 800],
    [SubscriptionPlan.pro, 2_400],
    [SubscriptionPlan.business, 8_000],
    [SubscriptionPlan.max, 16_000],
  ])("grants %s plan credits", (plan, limit) => {
    expect(entitlement({ plan }).limitMicrocents).toBe(limit * CREDIT);
  });

  it("gives every trial user the full Pro-sized allowance without seat proration", () => {
    const result = entitlement({
      plan: SubscriptionPlan.starter,
      status: SubscriptionStatus.trial,
      trialEndDate: new Date("2026-08-13T12:00:00.000Z"),
      activeSeatAt: new Date("2026-08-06T11:59:00.000Z"),
    });

    expect(result.limitMicrocents).toBe(TRIAL_HOSTED_AI_CREDITS_PER_ACTIVE_USER * CREDIT);
    expect(result.blockedReason).toBeNull();
  });

  it("fails closed when Enterprise has no contracted figure", () => {
    const result = entitlement({ plan: SubscriptionPlan.enterprise });

    expect(result.limitMicrocents).toBe(0);
    expect(result.blockedReason).toBe("enterprise_allowance_missing");
  });

  it("uses the finite Enterprise allowance", () => {
    expect(entitlement({ plan: SubscriptionPlan.enterprise, enterpriseCreditsPerUser: 3400 }).limitMicrocents).toBe(
      3400 * CREDIT,
    );
  });

  it("applies signed current-period adjustments after seat proration", () => {
    expect(entitlement({ adjustmentMicrocents: 75 * CREDIT }).limitMicrocents).toBe(2_475 * CREDIT);
    expect(entitlement({ adjustmentMicrocents: -75 * CREDIT }).limitMicrocents).toBe(2_325 * CREDIT);
    expect(entitlement({ adjustmentMicrocents: 2_500_000 }).limitMicrocents).toBe(2_402_500_000);
  });

  it("applies signed current-period adjustments to trial allowances", () => {
    const trial = {
      status: SubscriptionStatus.trial,
      trialEndDate: new Date("2026-08-13T12:00:00.000Z"),
    } as const;

    expect(entitlement({ ...trial, adjustmentMicrocents: 75 * CREDIT }).limitMicrocents).toBe(2_475 * CREDIT);
    expect(entitlement({ ...trial, adjustmentMicrocents: -75 * CREDIT }).limitMicrocents).toBe(2_325 * CREDIT);
  });

  it("does not let an adjustment bypass missing Enterprise configuration", () => {
    expect(entitlement({ plan: SubscriptionPlan.enterprise, adjustmentMicrocents: 75 * CREDIT })).toMatchObject({
      limitMicrocents: 0,
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

  it("prorates newly activated paid seats to the next whole microcent, not a whole credit", () => {
    const period = {
      start: new Date("2026-08-01T00:00:00.000Z"),
      resetAt: new Date("2026-09-01T00:00:00.000Z"),
    };

    expect(prorateAgentAllowanceForSeat(500 * CREDIT, new Date("2026-08-16T12:00:00.000Z"), period)).toBe(250 * CREDIT);
    expect(prorateAgentAllowanceForSeat(200 * CREDIT, new Date("2026-08-31T23:59:00.000Z"), period)).toBe(4_481);
  });

  it("keeps microcent proration exact for a large finite Enterprise allowance", () => {
    const period = {
      start: new Date("2026-08-01T00:00:00.000Z"),
      resetAt: new Date("2026-09-01T00:00:00.000Z"),
    };
    const allowance = Number.MAX_SAFE_INTEGER;
    const activeSeatAt = new Date("2026-08-16T12:00:00.000Z");
    const periodMs = BigInt(period.resetAt.getTime() - period.start.getTime());
    const remainingMs = BigInt(period.resetAt.getTime() - activeSeatAt.getTime());
    const expected = Number((BigInt(allowance) * remainingMs + periodMs - 1n) / periodMs);

    expect(prorateAgentAllowanceForSeat(allowance, activeSeatAt, period)).toBe(expected);
  });

  it("fails closed when an active paid seat has no usable activation timestamp", () => {
    expect(entitlement({ activeSeatAt: null })).toMatchObject({
      limitMicrocents: 0,
      blockedReason: "subscription_unavailable",
    });
    expect(entitlement({ activeSeatAt: new Date("2026-08-06T12:00:01.000Z") })).toMatchObject({
      limitMicrocents: 0,
      blockedReason: "subscription_unavailable",
    });
  });

  it("raises or clamps the current prorated ceiling when the plan changes", () => {
    const activeSeatAt = new Date("2026-07-31T10:30:00.000Z");
    const pro = entitlement({ plan: SubscriptionPlan.pro, activeSeatAt });
    const business = entitlement({ plan: SubscriptionPlan.business, activeSeatAt });
    const starter = entitlement({ plan: SubscriptionPlan.starter, activeSeatAt });

    expect(business.limitMicrocents).toBeGreaterThan(pro.limitMicrocents);
    expect(starter.limitMicrocents).toBeLessThan(pro.limitMicrocents);
  });
});

describe("workspace credit rate", () => {
  function rate(overrides: Partial<Parameters<typeof workspaceAgentCreditRate>[0]> = {}) {
    return workspaceAgentCreditRate({
      plan: SubscriptionPlan.starter,
      status: ACTIVE,
      trialEndDate: null,
      enterpriseCreditsPerUser: null,
      now: NOW,
      ...overrides,
    });
  }

  it("reports the plan rate for a paid workspace", () => {
    expect(rate({ plan: SubscriptionPlan.starter })).toBe(800);
    expect(rate({ plan: SubscriptionPlan.pro })).toBe(2_400);
    expect(rate({ plan: SubscriptionPlan.business })).toBe(8_000);
    expect(rate({ plan: SubscriptionPlan.max })).toBe(16_000);
  });

  it("reports the trial rate whatever the plan says, until the trial ends", () => {
    const live = { status: SubscriptionStatus.trial, trialEndDate: new Date("2026-08-20T12:00:00.000Z") };
    expect(rate({ ...live, plan: SubscriptionPlan.starter })).toBe(TRIAL_HOSTED_AI_CREDITS_PER_ACTIVE_USER);
    expect(rate({ ...live, plan: SubscriptionPlan.business })).toBe(TRIAL_HOSTED_AI_CREDITS_PER_ACTIVE_USER);
    expect(rate({ ...live, plan: SubscriptionPlan.enterprise })).toBe(TRIAL_HOSTED_AI_CREDITS_PER_ACTIVE_USER);
  });

  it("reports nothing once the trial has lapsed or the subscription is not usable", () => {
    expect(rate({ status: SubscriptionStatus.trial, trialEndDate: new Date("2026-08-01T12:00:00.000Z") })).toBeNull();
    expect(rate({ status: SubscriptionStatus.cancelled })).toBeNull();
    expect(rate({ status: SubscriptionStatus.pastDue })).toBeNull();
  });

  it("draws the Enterprise rate from the contracted value and reports nothing without one", () => {
    expect(rate({ plan: SubscriptionPlan.enterprise, enterpriseCreditsPerUser: 750 })).toBe(750);
    expect(rate({ plan: SubscriptionPlan.enterprise, enterpriseCreditsPerUser: null })).toBeNull();
    expect(rate({ plan: SubscriptionPlan.enterprise, enterpriseCreditsPerUser: 0 })).toBeNull();
  });
});

describe("stored microcents", () => {
  it("reads BigInt ledger columns exactly", () => {
    expect(agentMicrocentsFromStorage(753_412n, "usage")).toBe(753_412);
    expect(agentMicrocentsFromStorage(-2_500_000n, "adjustment")).toBe(-2_500_000);
    expect(agentMicrocentsFromStorage(null, "usage")).toBe(0);
  });

  it("refuses a stored amount beyond the exact integer range", () => {
    expect(() => agentMicrocentsFromStorage(BigInt(Number.MAX_SAFE_INTEGER) + 2n, "usage")).toThrow(
      "usage is invalid.",
    );
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

describe("workspace indexing share", () => {
  it("splits unassigned indexing usage by allowance, rounding each share up", () => {
    const pool = 1_000 * CREDIT;
    expect(
      workspaceIndexingShareMicrocents({
        unassignedMicrocents: 100 * CREDIT,
        memberLimitMicrocents: 500 * CREDIT,
        poolLimitMicrocents: pool,
      }),
    ).toBe(50 * CREDIT);
    const shares = [333 * CREDIT, 333 * CREDIT, 334 * CREDIT].map((memberLimitMicrocents) =>
      workspaceIndexingShareMicrocents({ unassignedMicrocents: 7, memberLimitMicrocents, poolLimitMicrocents: pool }),
    );
    expect(shares).toEqual([3, 3, 3]);
    expect(shares.reduce((total, share) => total + share, 0)).toBeGreaterThanOrEqual(7);
    for (const empty of [
      { unassignedMicrocents: 0, memberLimitMicrocents: 1, poolLimitMicrocents: 1 },
      { unassignedMicrocents: 5, memberLimitMicrocents: 0, poolLimitMicrocents: 1 },
      { unassignedMicrocents: 5, memberLimitMicrocents: 1, poolLimitMicrocents: 0 },
    ])
      expect(workspaceIndexingShareMicrocents(empty)).toBe(0);
  });

  it("stays exact for allowances whose product exceeds a double", () => {
    expect(
      workspaceIndexingShareMicrocents({
        unassignedMicrocents: 9_000_000_000_000,
        memberLimitMicrocents: 9_000_000_000_001,
        poolLimitMicrocents: 9_000_000_000_001,
      }),
    ).toBe(9_000_000_000_000);
  });

  it("bounds a member by both their own allowance and what the workspace pool has left", () => {
    const headroom = (memberUsedMicrocents: number, poolUsedMicrocents: number) =>
      memberCreditHeadroomMicrocents({
        memberLimitMicrocents: 500,
        memberUsedMicrocents,
        poolLimitMicrocents: 1_000,
        poolUsedMicrocents,
      });
    expect(headroom(100, 100)).toBe(400);
    expect(headroom(100, 950)).toBe(50);
    expect(headroom(600, 700)).toBe(0);
  });
});

describe("agentUsageMultiplier", () => {
  const multiplier = (overrides: Partial<Parameters<typeof agentUsageMultiplier>[0]> = {}) =>
    agentUsageMultiplier({
      appMode: "cloud",
      plan: SubscriptionPlan.pro,
      status: ACTIVE,
      trialEndDate: null,
      now: NOW,
      ...overrides,
    });

  it("reports each paid plan's multiple of Starter", () => {
    expect(multiplier({ plan: SubscriptionPlan.starter })).toBe(1);
    expect(multiplier({ plan: SubscriptionPlan.pro })).toBe(3);
    expect(multiplier({ plan: SubscriptionPlan.business })).toBe(10);
    expect(multiplier({ plan: SubscriptionPlan.max })).toBe(20);
  });

  it("reports the trial's Pro multiple and nothing for contracts, lapsed trials or self-hosting", () => {
    const live = { status: SubscriptionStatus.trial, trialEndDate: new Date("2026-08-20T12:00:00.000Z") };
    expect(multiplier({ ...live, plan: SubscriptionPlan.business })).toBe(3);
    expect(multiplier({ plan: SubscriptionPlan.enterprise })).toBeNull();
    expect(
      multiplier({ status: SubscriptionStatus.trial, trialEndDate: new Date("2026-08-01T12:00:00.000Z") }),
    ).toBeNull();
    expect(multiplier({ status: SubscriptionStatus.cancelled })).toBeNull();
    expect(multiplier({ appMode: "self-hosted" })).toBeNull();
  });

  it("grants the Max allowance from the same base", () => {
    expect(entitlement({ plan: SubscriptionPlan.max }).limitMicrocents).toBe(16_000 * CREDIT);
  });
});
