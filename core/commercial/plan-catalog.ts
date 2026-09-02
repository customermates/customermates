export const PLAN_IDS = ["starter", "pro", "business", "enterprise"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export const PURCHASABLE_PLAN_IDS = ["starter", "pro", "business"] as const;
export type PurchasablePlanId = (typeof PURCHASABLE_PLAN_IDS)[number];

export const BILLING_CADENCES = ["monthly", "annual"] as const;
export type BillingCadence = (typeof BILLING_CADENCES)[number];

export const AVAILABLE_BILLING_CADENCES = ["monthly"] as const satisfies readonly BillingCadence[];
export type AvailableBillingCadence = (typeof AVAILABLE_BILLING_CADENCES)[number];

export type OfferId = `${PurchasablePlanId}:${AvailableBillingCadence}`;

export type PlanEntitlements = {
  agentChat: boolean;
  messaging: boolean;
  includedAccountsPerUser: number | "unlimited";
  includedRoutines: number | "unlimited";
  sharedAccounts: boolean;
  hostedAiCreditsPerActiveUser: number | "contract" | null;
};

export type CommercialOffer = {
  id: OfferId;
  plan: PurchasablePlanId;
  cadence: AvailableBillingCadence;
  currency: "EUR";
  unitPriceMinor: number;
  intervalUnit: "month";
  intervalQuantity: 1;
  billingModel: "per-seat";
};

type SelfServePlanDefinition = {
  plan: PurchasablePlanId;
  availability: "self-serve";
  entitlements: PlanEntitlements;
  offers: Record<AvailableBillingCadence, CommercialOffer>;
};

type SalesLedPlanDefinition = {
  plan: "enterprise";
  availability: "sales-led";
  entitlements: PlanEntitlements;
  offers: Record<string, never>;
};

export type PlanDefinition = SelfServePlanDefinition | SalesLedPlanDefinition;

export const CLOUD_TRIAL = {
  plan: "pro",
  days: 7,
  owner: "application",
  providerTrialDays: 0,
} as const satisfies {
  plan: PurchasablePlanId;
  days: number;
  owner: "application";
  providerTrialDays: number;
};

export const PLAN_CATALOG = {
  starter: {
    plan: "starter",
    availability: "self-serve",
    entitlements: {
      agentChat: true,
      messaging: false,
      includedAccountsPerUser: 0,
      includedRoutines: 0,
      sharedAccounts: false,
      hostedAiCreditsPerActiveUser: 200,
    },
    offers: {
      monthly: {
        id: "starter:monthly",
        plan: "starter",
        cadence: "monthly",
        currency: "EUR",
        unitPriceMinor: 1_200,
        intervalUnit: "month",
        intervalQuantity: 1,
        billingModel: "per-seat",
      },
    },
  },
  pro: {
    plan: "pro",
    availability: "self-serve",
    entitlements: {
      agentChat: true,
      messaging: true,
      includedAccountsPerUser: 1,
      includedRoutines: 3,
      sharedAccounts: false,
      hostedAiCreditsPerActiveUser: 500,
    },
    offers: {
      monthly: {
        id: "pro:monthly",
        plan: "pro",
        cadence: "monthly",
        currency: "EUR",
        unitPriceMinor: 2_900,
        intervalUnit: "month",
        intervalQuantity: 1,
        billingModel: "per-seat",
      },
    },
  },
  business: {
    plan: "business",
    availability: "self-serve",
    entitlements: {
      agentChat: true,
      messaging: true,
      includedAccountsPerUser: 3,
      includedRoutines: "unlimited",
      sharedAccounts: true,
      hostedAiCreditsPerActiveUser: 1_200,
    },
    offers: {
      monthly: {
        id: "business:monthly",
        plan: "business",
        cadence: "monthly",
        currency: "EUR",
        unitPriceMinor: 6_900,
        intervalUnit: "month",
        intervalQuantity: 1,
        billingModel: "per-seat",
      },
    },
  },
  enterprise: {
    plan: "enterprise",
    availability: "sales-led",
    entitlements: {
      agentChat: true,
      messaging: true,
      includedAccountsPerUser: "unlimited",
      includedRoutines: "unlimited",
      sharedAccounts: true,
      hostedAiCreditsPerActiveUser: "contract",
    },
    offers: {},
  },
} as const satisfies Record<PlanId, PlanDefinition>;

export const COMMERCIAL_OFFERS = PURCHASABLE_PLAN_IDS.map((plan) => PLAN_CATALOG[plan].offers.monthly);

export function isPlanId(value: string): value is PlanId {
  return (PLAN_IDS as readonly string[]).includes(value);
}

export function isPurchasablePlanId(value: string): value is PurchasablePlanId {
  return (PURCHASABLE_PLAN_IDS as readonly string[]).includes(value);
}

export function getPlanDefinition(plan: PlanId): PlanDefinition {
  return PLAN_CATALOG[plan];
}

export function getCommercialOffer(plan: PlanId, cadence: BillingCadence): CommercialOffer | null {
  if (!isPurchasablePlanId(plan) || cadence !== "monthly") return null;
  return PLAN_CATALOG[plan].offers.monthly;
}

export function getCommercialOfferOrThrow(plan: PlanId, cadence: BillingCadence): CommercialOffer {
  const offer = getCommercialOffer(plan, cadence);
  if (!offer) throw new Error(`Commercial offer is unavailable for ${plan}:${cadence}`);
  return offer;
}

export function totalPriceAmountMinor(offer: CommercialOffer, seats: number): number {
  if (!Number.isSafeInteger(seats) || seats < 1) throw new Error("Seat count must be a positive integer");
  const total = offer.unitPriceMinor * seats;
  if (!Number.isSafeInteger(total)) throw new Error("Price total exceeds the safe integer range");
  return total;
}

export function formatCommercialAmount(
  amountMinor: number,
  locale: string,
  currency: CommercialOffer["currency"] = "EUR",
): string {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0)
    throw new Error("Amount must be non-negative integer cents");
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: amountMinor % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amountMinor / 100);
}
