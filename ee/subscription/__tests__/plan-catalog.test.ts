import { describe, expect, it } from "vitest";

import {
  BILLING_CADENCES,
  CLOUD_TRIAL,
  COMMERCIAL_OFFERS,
  formatCommercialAmount,
  getCommercialOffer,
  getPlanDefinition,
  PLAN_IDS,
  totalPriceAmountMinor,
} from "@/core/commercial/plan-catalog";

describe("commercial plan catalog", () => {
  it("defines every product plan exactly once and keeps Enterprise sales-led", () => {
    expect(PLAN_IDS).toEqual(["starter", "pro", "business", "enterprise"]);
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
      includedRoutines: 0,
      sharedAccounts: false,
      hostedAiCreditsPerActiveUser: 200,
    });
    expect(getPlanDefinition("pro").entitlements.includedAccountsPerUser).toBe(1);
    expect(getPlanDefinition("business").entitlements.includedAccountsPerUser).toBe(3);
    expect(getPlanDefinition("enterprise").entitlements.includedAccountsPerUser).toBe("unlimited");
    expect(getPlanDefinition("pro").entitlements.includedRoutines).toBe(3);
    expect(getPlanDefinition("business").entitlements.includedRoutines).toBe("unlimited");
    expect(getPlanDefinition("enterprise").entitlements.includedRoutines).toBe("unlimited");
    expect(getPlanDefinition("pro").entitlements.hostedAiCreditsPerActiveUser).toBe(500);
    expect(getPlanDefinition("business").entitlements.hostedAiCreditsPerActiveUser).toBe(1_200);
    expect(getPlanDefinition("enterprise").entitlements.hostedAiCreditsPerActiveUser).toBe("contract");
  });

  it("formats and totals integer minor-unit amounts at the presentation boundary", () => {
    const offer = COMMERCIAL_OFFERS[1];
    expect(totalPriceAmountMinor(offer, 5)).toBe(14_500);
    expect(formatCommercialAmount(offer.unitPriceMinor, "en", offer.currency)).toBe("€29");
    expect(formatCommercialAmount(offer.unitPriceMinor, "de", offer.currency)).toMatch(/^29(?:\u00a0| )€$/);
    expect(() => totalPriceAmountMinor(offer, 0)).toThrow("positive integer");
  });
});
