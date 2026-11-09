import { describe, expect, it } from "vitest";

import { SubscriptionPlan, SubscriptionStatus } from "@/generated/prisma";

import {
  effectivePlanId,
  getEntitlements,
  isOnFreePlan,
  isSubscriptionExpired,
  isSubscriptionLocked,
} from "../entitlements";

const NOW = new Date("2026-11-07T12:00:00.000Z");
const ended = new Date("2026-11-01T12:00:00.000Z");
const running = new Date("2026-11-20T12:00:00.000Z");

function subscription(
  status: SubscriptionStatus,
  plan: SubscriptionPlan = SubscriptionPlan.pro,
  trialEndDate: Date | null = null,
) {
  return { status, plan, trialEndDate };
}

describe("Free plan after the trial", () => {
  it("drops a trial that ended without a paid plan to Free instead of locking it", () => {
    const trial = subscription(SubscriptionStatus.trial, SubscriptionPlan.pro, ended);

    expect(isOnFreePlan(trial, NOW)).toBe(true);
    expect(effectivePlanId(trial, NOW)).toBe("free");
    expect(isSubscriptionExpired(trial)).toBe(true);
    expect(isSubscriptionLocked(trial)).toBe(false);
  });

  it("keeps a running trial on Pro", () => {
    const trial = subscription(SubscriptionStatus.trial, SubscriptionPlan.pro, running);

    expect(isOnFreePlan(trial, NOW)).toBe(false);
    expect(effectivePlanId(trial, NOW)).toBe("pro");
  });

  it("moves a workspace whose paid plan ended after its trial to Free", () => {
    const lapsed = subscription(SubscriptionStatus.expired, SubscriptionPlan.business, ended);

    expect(effectivePlanId(lapsed, NOW)).toBe("free");
    expect(isSubscriptionLocked(lapsed)).toBe(false);
  });

  it("keeps a further workspace without a trial waiting for its first plan", () => {
    const awaiting = subscription(SubscriptionStatus.expired);

    expect(isOnFreePlan(awaiting, NOW)).toBe(false);
    expect(effectivePlanId(awaiting, NOW)).toBe("pro");
    expect(isSubscriptionLocked(awaiting)).toBe(true);
  });

  it("leaves paying customers, failed payments and Enterprise unchanged", () => {
    expect(effectivePlanId(subscription(SubscriptionStatus.active, SubscriptionPlan.business), NOW)).toBe("business");
    expect(effectivePlanId(subscription(SubscriptionStatus.pastDue), NOW)).toBe("pro");
    expect(isSubscriptionLocked(subscription(SubscriptionStatus.unPaid))).toBe(true);
    expect(isOnFreePlan(subscription(SubscriptionStatus.unPaid), NOW)).toBe(false);
    expect(isSubscriptionLocked(subscription(SubscriptionStatus.expired, SubscriptionPlan.enterprise))).toBe(true);
  });

  it("gives Free no inbox, no Mate, no routines, no webhooks and the approved limits", () => {
    expect(getEntitlements("free")).toMatchObject({
      agentChat: false,
      messaging: false,
      includedAccountsPerUser: 0,
      includedRoutinesPerUser: 0,
      hostedAiCreditsPerActiveUser: null,
      webhooks: false,
      usageLimits: { maxMembers: 1, maxRecords: 250, apiRequestsPerMinute: 10, apiRequestsPerDay: 200 },
    });
  });
});
