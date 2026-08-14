import { describe, expect, it } from "vitest";

import { getCommercialOfferOrThrow } from "@/core/commercial/plan-catalog";
import {
  assertProviderOfferMatchesCatalog,
  providerOfferMismatches,
  type ProviderOfferSnapshot,
} from "../provider-offer-verification";

const OFFER = getCommercialOfferOrThrow("pro", "monthly");
const MATCHING: ProviderOfferSnapshot = {
  testMode: true,
  variantStatus: "published",
  currency: "EUR",
  category: "subscription",
  scheme: "standard",
  unitPriceMinor: 2_900,
  unitPriceDecimal: null,
  usageAggregation: null,
  setupFeeEnabled: false,
  setupFeeMinor: null,
  packageSize: 1,
  renewalIntervalUnit: "month",
  renewalIntervalQuantity: 1,
  trialIntervalUnit: null,
  trialIntervalQuantity: null,
};

describe("provider offer verification", () => {
  it("accepts an exact test-mode provider snapshot", () => {
    expect(providerOfferMismatches(MATCHING, OFFER)).toEqual([]);
    expect(() => assertProviderOfferMatchesCatalog(MATCHING, OFFER)).not.toThrow();
  });

  it("reports every commercially relevant mismatch without exposing an ID", () => {
    const mismatches = providerOfferMismatches(
      {
        ...MATCHING,
        testMode: false,
        variantStatus: "draft",
        currency: "USD",
        unitPriceMinor: 3_000,
        renewalIntervalUnit: "year",
        trialIntervalUnit: "day",
        trialIntervalQuantity: 7,
      },
      OFFER,
    );

    expect(mismatches).toHaveLength(7);
    expect(mismatches.join(" ")).not.toMatch(/2002|variant ID/i);
  });

  it("rejects an indeterminate setup-fee state", () => {
    expect(providerOfferMismatches({ ...MATCHING, setupFeeEnabled: null }, OFFER)).toContain(
      "setup fee must be explicitly disabled",
    );
  });
});
