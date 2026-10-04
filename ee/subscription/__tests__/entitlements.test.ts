import { describe, expect, it } from "vitest";

import { SubscriptionPlan, SubscriptionStatus } from "@/generated/prisma";

import {
  getEffectiveEntitlements,
  getEntitlements,
  isSubscriptionExpired,
  isSubscriptionUsable,
  TRIAL_HOSTED_AI_CREDITS_PER_ACTIVE_USER,
} from "../entitlements";

const PAST = new Date(Date.now() - 24 * 60 * 60 * 1000);
const FUTURE = new Date(Date.now() + 24 * 60 * 60 * 1000);

describe("hosted AI plan entitlements", () => {
  it("defines the monthly per-user allowance for every paid plan", () => {
    expect(getEntitlements(SubscriptionPlan.starter).hostedAiCreditsPerActiveUser).toBe(200);
    expect(getEntitlements(SubscriptionPlan.pro).hostedAiCreditsPerActiveUser).toBe(600);
    expect(getEntitlements(SubscriptionPlan.business).hostedAiCreditsPerActiveUser).toBe(2_000);
    expect(getEntitlements(SubscriptionPlan.max).hostedAiCreditsPerActiveUser).toBe(4_000);
    expect(getEntitlements(SubscriptionPlan.enterprise).hostedAiCreditsPerActiveUser).toBe("contract");
  });

  it("states every allowance as a multiple of Starter", () => {
    expect(getEntitlements(SubscriptionPlan.starter).hostedAiUsageMultiplier).toBe(1);
    expect(getEntitlements(SubscriptionPlan.pro).hostedAiUsageMultiplier).toBe(3);
    expect(getEntitlements(SubscriptionPlan.business).hostedAiUsageMultiplier).toBe(10);
    expect(getEntitlements(SubscriptionPlan.max).hostedAiUsageMultiplier).toBe(20);
    expect(getEntitlements(SubscriptionPlan.enterprise).hostedAiUsageMultiplier).toBe("contract");
    expect(TRIAL_HOSTED_AI_CREDITS_PER_ACTIVE_USER).toBe(600);
  });

  it("gives Max everything Business has plus more connected accounts", () => {
    const business = getEntitlements(SubscriptionPlan.business);
    const max = getEntitlements(SubscriptionPlan.max);

    expect(max).toMatchObject({
      agentChat: business.agentChat,
      messaging: business.messaging,
      sharedAccounts: true,
      includedRoutinesPerUser: "unlimited",
      includedAccountsPerUser: 10,
    });
    expect(business.includedAccountsPerUser).toBe(3);
  });

  it("does not grant hosted processing to self-hosted installations", () => {
    expect(
      getEffectiveEntitlements({ appMode: "self-hosted", plan: SubscriptionPlan.business })
        .hostedAiCreditsPerActiveUser,
    ).toBeNull();
    expect(
      getEffectiveEntitlements({ appMode: "self-hosted", plan: SubscriptionPlan.max }).hostedAiUsageMultiplier,
    ).toBeNull();
  });
});

describe("isSubscriptionExpired", () => {
  it("treats unpaid and expired statuses as expired regardless of trial date", () => {
    expect(isSubscriptionExpired({ status: SubscriptionStatus.unPaid, trialEndDate: null })).toBe(true);
    expect(isSubscriptionExpired({ status: SubscriptionStatus.expired, trialEndDate: FUTURE })).toBe(true);
  });

  it("treats a trial whose end date has passed as expired", () => {
    expect(isSubscriptionExpired({ status: SubscriptionStatus.trial, trialEndDate: PAST })).toBe(true);
  });

  it("does not treat an active subscription or a live/open trial as expired", () => {
    expect(isSubscriptionExpired({ status: SubscriptionStatus.active, trialEndDate: null })).toBe(false);
    expect(isSubscriptionExpired({ status: SubscriptionStatus.trial, trialEndDate: FUTURE })).toBe(false);
    expect(isSubscriptionExpired({ status: SubscriptionStatus.trial, trialEndDate: null })).toBe(false);
  });
});

describe("isSubscriptionUsable", () => {
  it("is usable while active or on a live/open trial", () => {
    expect(isSubscriptionUsable({ status: SubscriptionStatus.active, trialEndDate: null })).toBe(true);
    expect(isSubscriptionUsable({ status: SubscriptionStatus.trial, trialEndDate: FUTURE })).toBe(true);
    expect(isSubscriptionUsable({ status: SubscriptionStatus.trial, trialEndDate: null })).toBe(true);
  });

  it("is not usable once the trial lapses or the subscription is unpaid/expired", () => {
    expect(isSubscriptionUsable({ status: SubscriptionStatus.trial, trialEndDate: PAST })).toBe(false);
    expect(isSubscriptionUsable({ status: SubscriptionStatus.unPaid, trialEndDate: null })).toBe(false);
    expect(isSubscriptionUsable({ status: SubscriptionStatus.expired, trialEndDate: null })).toBe(false);
  });
});
