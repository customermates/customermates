import type { CommercialOffer } from "@/core/commercial/plan-catalog";

import { CLOUD_TRIAL } from "@/core/commercial/plan-catalog";

export type ProviderOfferSnapshot = {
  testMode: boolean;
  variantStatus: "pending" | "draft" | "published";
  currency: string;
  category: "one_time" | "subscription" | "lead_magnet" | "pwyw";
  scheme: "standard" | "package" | "graduated" | "volume";
  unitPriceMinor: number | null;
  unitPriceDecimal: string | null;
  usageAggregation: string | null;
  setupFeeEnabled: boolean | null;
  setupFeeMinor: number | null;
  packageSize: number;
  renewalIntervalUnit: string | null;
  renewalIntervalQuantity: number | null;
  trialIntervalUnit: string | null;
  trialIntervalQuantity: number | null;
};

export function providerOfferMismatches(snapshot: ProviderOfferSnapshot, offer: CommercialOffer): string[] {
  const mismatches: string[] = [];
  const check = (condition: boolean, message: string) => {
    if (!condition) mismatches.push(message);
  };

  check(snapshot.testMode, "variant must be in Lemon Squeezy test mode");
  check(snapshot.variantStatus === "published", "variant must be published");
  check(snapshot.currency === offer.currency, `store currency must be ${offer.currency}`);
  check(snapshot.category === "subscription", "price category must be subscription");
  check(snapshot.scheme === "standard", "price scheme must be standard per-seat pricing");
  check(snapshot.unitPriceMinor === offer.unitPriceMinor, `unit price must be ${offer.unitPriceMinor} cents`);
  check(snapshot.unitPriceDecimal === null, "usage-based decimal pricing must be disabled");
  check(snapshot.usageAggregation === null, "usage aggregation must be disabled");
  check(snapshot.setupFeeEnabled === false, "setup fee must be explicitly disabled");
  check(snapshot.setupFeeMinor === null || snapshot.setupFeeMinor === 0, "setup fee amount must be zero");
  check(snapshot.packageSize === 1, "standard per-seat package size must be one");
  check(snapshot.renewalIntervalUnit === offer.intervalUnit, `renewal interval must be ${offer.intervalUnit}`);
  check(snapshot.renewalIntervalQuantity === offer.intervalQuantity, "renewal interval quantity must be one");
  check(
    CLOUD_TRIAL.owner === "application" && snapshot.trialIntervalUnit === null,
    "provider trial must be disabled; the app owns the trial",
  );
  check(
    snapshot.trialIntervalQuantity === null || snapshot.trialIntervalQuantity === CLOUD_TRIAL.providerTrialDays,
    `provider trial quantity must be ${CLOUD_TRIAL.providerTrialDays}`,
  );

  return mismatches;
}

export function assertProviderOfferMatchesCatalog(snapshot: ProviderOfferSnapshot, offer: CommercialOffer): void {
  const mismatches = providerOfferMismatches(snapshot, offer);
  if (mismatches.length > 0) throw new Error(`${offer.id}: ${mismatches.join("; ")}`);
}
