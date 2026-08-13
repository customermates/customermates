import "server-only";

import type { CommercialOffer } from "@/core/commercial/plan-catalog";

import { env } from "@/env";
import { parseLemonSqueezyBindings, type LemonSqueezyBindingEnvironment } from "./lemon-squeezy-binding-contract";

export { LEMON_SQUEEZY_VARIANT_ENV_KEYS } from "./lemon-squeezy-binding-contract";
export type { LemonSqueezyBindingEnvironment, LemonSqueezyBindings } from "./lemon-squeezy-binding-contract";

function runtimeBindingEnvironment(): LemonSqueezyBindingEnvironment {
  return {
    LEMONSQUEEZY_VARIANT_ID_STARTER: env.LEMONSQUEEZY_VARIANT_ID_STARTER,
    LEMONSQUEEZY_VARIANT_ID_PRO: env.LEMONSQUEEZY_VARIANT_ID_PRO,
    LEMONSQUEEZY_VARIANT_ID_BUSINESS: env.LEMONSQUEEZY_VARIANT_ID_BUSINESS,
    ...Object.fromEntries(Object.entries(process.env).filter(([key]) => key.startsWith("LEMONSQUEEZY_VARIANT_ID_"))),
  } as LemonSqueezyBindingEnvironment;
}

export function offerToVariant(
  offer: CommercialOffer,
  input: LemonSqueezyBindingEnvironment = runtimeBindingEnvironment(),
): string {
  return parseLemonSqueezyBindings(input).byOffer[offer.id].checkoutVariantId;
}

export function variantToOffer(
  variantId: string,
  input: LemonSqueezyBindingEnvironment = runtimeBindingEnvironment(),
): CommercialOffer | null {
  return parseLemonSqueezyBindings(input).byVariant.get(variantId) ?? null;
}

export function variantToOfferOrThrow(
  variantId: string,
  input: LemonSqueezyBindingEnvironment = runtimeBindingEnvironment(),
): CommercialOffer {
  const offer = variantToOffer(variantId, input);
  if (!offer) throw new Error("Unknown Lemon Squeezy variant; refusing to retain stale subscription entitlements");
  return offer;
}
