import "server-only";

import type { CommercialOffer, PurchasablePlanId } from "@/core/commercial/plan-catalog";

import { env } from "@/env";
import {
  parseLemonSqueezyBindings,
  unboundOptionalCheckoutOffers,
  type LemonSqueezyBindingEnvironment,
} from "./lemon-squeezy-binding-contract";

export { LEMON_SQUEEZY_VARIANT_ENV_KEYS } from "./lemon-squeezy-binding-contract";
export type { LemonSqueezyBindingEnvironment, LemonSqueezyBindings } from "./lemon-squeezy-binding-contract";

function runtimeBindingEnvironment(): LemonSqueezyBindingEnvironment {
  return {
    LEMONSQUEEZY_VARIANT_ID_STARTER: env.LEMONSQUEEZY_VARIANT_ID_STARTER,
    LEMONSQUEEZY_VARIANT_ID_PRO: env.LEMONSQUEEZY_VARIANT_ID_PRO,
    LEMONSQUEEZY_VARIANT_ID_BUSINESS: env.LEMONSQUEEZY_VARIANT_ID_BUSINESS,
    LEMONSQUEEZY_VARIANT_ID_MAX: env.LEMONSQUEEZY_VARIANT_ID_MAX,
    ...Object.fromEntries(Object.entries(process.env).filter(([key]) => key.startsWith("LEMONSQUEEZY_VARIANT_ID_"))),
  } as LemonSqueezyBindingEnvironment;
}

export function isOfferCheckoutAvailable(
  offer: CommercialOffer,
  input: LemonSqueezyBindingEnvironment = runtimeBindingEnvironment(),
): boolean {
  return !unboundOptionalCheckoutOffers(input).some((unbound) => unbound.id === offer.id);
}

export function checkoutUnavailablePlans(
  input: LemonSqueezyBindingEnvironment = runtimeBindingEnvironment(),
): PurchasablePlanId[] {
  return unboundOptionalCheckoutOffers(input).map((offer) => offer.plan);
}

export function offerToVariant(
  offer: CommercialOffer,
  input: LemonSqueezyBindingEnvironment = runtimeBindingEnvironment(),
): string {
  const binding = parseLemonSqueezyBindings(input).byOffer[offer.id];
  if (!binding) throw new Error(`${offer.id} has no Lemon Squeezy checkout variant configured`);
  return binding.checkoutVariantId;
}

export function variantToOffer(
  variantId: string,
  input: LemonSqueezyBindingEnvironment = runtimeBindingEnvironment(),
): CommercialOffer | null {
  return parseLemonSqueezyBindings(input).byVariant.get(variantId) ?? null;
}
