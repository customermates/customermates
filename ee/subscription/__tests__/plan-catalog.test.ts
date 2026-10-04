import { describe, expect, it } from "vitest";

import {
  BILLING_CADENCES,
  CLOUD_TRIAL,
  COMMERCIAL_OFFERS,
  formatCommercialAmount,
  getCommercialOffer,
  getPlanDefinition,
  CLOUD_TRIAL_HOSTED_AI_CREDITS_PER_ACTIVE_USER,
  CLOUD_TRIAL_HOSTED_AI_USAGE_MULTIPLIER,
  HOSTED_AI_BASE_CREDITS_PER_ACTIVE_USER,
  PLAN_IDS,
  PURCHASABLE_PLAN_IDS,
  RECOMMENDED_PLAN_ID,
  totalPriceAmountMinor,
} from "@/core/commercial/plan-catalog";

describe("commercial plan catalog", () => {
  it("defines every product plan exactly once and keeps Enterprise sales-led", () => {
    expect(PLAN_IDS).toEqual(["starter", "pro", "business", "max", "enterprise"]);
    expect(PLAN_IDS.map((plan) => getPlanDefinition(plan).plan)).toEqual(PLAN_IDS);
    expect(getPlanDefinition("enterprise")).toMatchObject({
      availability: "sales-led",
      offers: {},
    });
  });

  it("owns the exact currently purchasable monthly EUR invoice amounts", () => {
    expect(COMMERCIAL_OFFERS.map((offer) => [offer.id, offer.unitPriceMinor])).toEqual([
      ["starter:monthly", 1_200],
      ["pro:monthly", 2_900],
      ["business:monthly", 6_900],
      ["max:monthly", 14_900],
    ]);
    for (const offer of COMMERCIAL_OFFERS) {
      expect(Number.isSafeInteger(offer.unitPriceMinor)).toBe(true);
      expect(offer).toMatchObject({
        currency: "EUR",
        cadence: "monthly",
        billingModel: "per-seat",
      });
    }
  });

  it("does not fabricate an annual offer", () => {
    expect(BILLING_CADENCES).toContain("annual");
    for (const plan of PLAN_IDS) expect(getCommercialOffer(plan, "annual")).toBeNull();
  });

  it("owns the app trial and public entitlement values", () => {
    expect(CLOUD_TRIAL).toEqual({
      plan: "pro",
      days: 7,
      owner: "application",
      providerTrialDays: 0,
    });
    expect(getPlanDefinition("starter").entitlements).toEqual({
      agentChat: true,
      messaging: false,
      includedAccountsPerUser: 0,
      includedRoutinesPerUser: 1,
      sharedAccounts: false,
      hostedAiUsageMultiplier: 1,
      hostedAiCreditsPerActiveUser: 200,
    });
    expect(getPlanDefinition("max").entitlements).toEqual({
      agentChat: true,
      messaging: true,
      includedAccountsPerUser: 10,
      includedRoutinesPerUser: "unlimited",
      sharedAccounts: true,
      hostedAiUsageMultiplier: 20,
      hostedAiCreditsPerActiveUser: 4_000,
    });
    expect(getPlanDefinition("pro").entitlements.includedAccountsPerUser).toBe(1);
    expect(getPlanDefinition("business").entitlements.includedAccountsPerUser).toBe(3);
    expect(getPlanDefinition("enterprise").entitlements.includedAccountsPerUser).toBe("unlimited");
    expect(getPlanDefinition("pro").entitlements.includedRoutinesPerUser).toBe(5);
    expect(getPlanDefinition("business").entitlements.includedRoutinesPerUser).toBe("unlimited");
    expect(getPlanDefinition("enterprise").entitlements.includedRoutinesPerUser).toBe("unlimited");
    expect(getPlanDefinition("pro").entitlements.hostedAiCreditsPerActiveUser).toBe(600);
    expect(getPlanDefinition("business").entitlements.hostedAiCreditsPerActiveUser).toBe(2_000);
    expect(getPlanDefinition("enterprise").entitlements.hostedAiCreditsPerActiveUser).toBe("contract");
  });

  it("derives every self-serve allowance from the one base and the plan multiplier", () => {
    expect(HOSTED_AI_BASE_CREDITS_PER_ACTIVE_USER).toBe(200);
    expect(
      PURCHASABLE_PLAN_IDS.map((plan) => [
        plan,
        getPlanDefinition(plan).entitlements.hostedAiUsageMultiplier,
        getPlanDefinition(plan).entitlements.hostedAiCreditsPerActiveUser,
      ]),
    ).toEqual([
      ["starter", 1, 200],
      ["pro", 3, 600],
      ["business", 10, 2_000],
      ["max", 20, 4_000],
    ]);
    expect(getPlanDefinition("enterprise").entitlements.hostedAiUsageMultiplier).toBe("contract");
    expect(CLOUD_TRIAL_HOSTED_AI_USAGE_MULTIPLIER).toBe(3);
    expect(CLOUD_TRIAL_HOSTED_AI_CREDITS_PER_ACTIVE_USER).toBe(600);
  });

  it("keeps Max a self-serve per-seat offer above Business and below sales-led Enterprise", () => {
    expect(PURCHASABLE_PLAN_IDS).toEqual(["starter", "pro", "business", "max"]);
    expect(getCommercialOffer("max", "monthly")).toEqual({
      id: "max:monthly",
      plan: "max",
      cadence: "monthly",
      currency: "EUR",
      unitPriceMinor: 14_900,
      intervalUnit: "month",
      intervalQuantity: 1,
      billingModel: "per-seat",
    });
    expect(getPlanDefinition("max").availability).toBe("self-serve");
    expect(RECOMMENDED_PLAN_ID).toBe("business");
  });

  it("formats and totals integer minor-unit amounts at the presentation boundary", () => {
    const offer = COMMERCIAL_OFFERS[1];
    expect(totalPriceAmountMinor(offer, 5)).toBe(14_500);
    expect(formatCommercialAmount(offer.unitPriceMinor, "en", offer.currency)).toBe("€29");
    expect(formatCommercialAmount(offer.unitPriceMinor, "de", offer.currency)).toMatch(/^29(?:\u00a0| )€$/);
    expect(() => totalPriceAmountMinor(offer, 0)).toThrow("positive integer");
  });
});
