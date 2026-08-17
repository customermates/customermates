import type { CommercialOffer, OfferId } from "@/core/commercial/plan-catalog";

import { COMMERCIAL_OFFERS } from "@/core/commercial/plan-catalog";

export const LEMON_SQUEEZY_VARIANT_ENV_KEYS = {
  "starter:monthly": "LEMONSQUEEZY_VARIANT_ID_STARTER",
  "pro:monthly": "LEMONSQUEEZY_VARIANT_ID_PRO",
  "business:monthly": "LEMONSQUEEZY_VARIANT_ID_BUSINESS",
} as const satisfies Record<OfferId, string>;

export type LemonSqueezyBindingEnvironment = Record<
  (typeof LEMON_SQUEEZY_VARIANT_ENV_KEYS)[OfferId],
  string | undefined
>;

export type LemonSqueezyBindings = {
  byOffer: Record<
    OfferId,
    {
      checkoutVariantId: string;
    }
  >;
  byVariant: ReadonlyMap<string, CommercialOffer>;
};

function parseVariantId(value: string, envKey: string): string {
  const variantId = value.trim();
  if (!/^[1-9]\d*$/.test(variantId) || !Number.isSafeInteger(Number(variantId)))
    throw new Error(`${envKey} must contain positive safe-integer Lemon Squeezy variant IDs`);

  return variantId;
}

export function parseLemonSqueezyBindings(input: LemonSqueezyBindingEnvironment): LemonSqueezyBindings {
  const supportedKeys = Object.values(LEMON_SQUEEZY_VARIANT_ENV_KEYS);
  const unsupportedKeys = Object.keys(input).filter(
    (key) => key.startsWith("LEMONSQUEEZY_VARIANT_ID_") && !supportedKeys.includes(key as never),
  );
  if (unsupportedKeys.length > 0)
    throw new Error("Unsupported Lemon Squeezy checkout binding; Enterprise and excess variants are not allowed");

  const byOffer = {} as LemonSqueezyBindings["byOffer"];
  const byVariant = new Map<string, CommercialOffer>();

  for (const offer of COMMERCIAL_OFFERS) {
    const envKey = LEMON_SQUEEZY_VARIANT_ENV_KEYS[offer.id];
    const configuredVariantId = input[envKey]?.trim();

    if (!configuredVariantId) throw new Error(`${envKey} is not configured for ${offer.id}`);
    const checkoutVariantId = parseVariantId(configuredVariantId, envKey);
    if (byVariant.has(checkoutVariantId)) throw new Error("Lemon Squeezy variant bindings must be globally unique");
    byVariant.set(checkoutVariantId, offer);

    byOffer[offer.id] = { checkoutVariantId };
  }

  if (Object.keys(byOffer).length !== COMMERCIAL_OFFERS.length)
    throw new Error("Lemon Squeezy checkout bindings must cover every commercial offer");

  return { byOffer, byVariant };
}
