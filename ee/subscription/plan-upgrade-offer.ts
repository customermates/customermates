import type { PurchasablePlanId } from "@/core/commercial/plan-catalog";

import { formatCommercialAmount, PLAN_CATALOG } from "@/core/commercial/plan-catalog";
import { getRequestAppLocale } from "@/i18n/request-app-locale";
import { DEFAULT_LOCALE, type AppLocale } from "@/i18n/locale-registry";

async function currentLocale(): Promise<AppLocale> {
  try {
    return await getRequestAppLocale();
  } catch {
    return DEFAULT_LOCALE;
  }
}

export function upgradeOfferPrice(plan: PurchasablePlanId, locale: string): string {
  const offer = PLAN_CATALOG[plan].offers.monthly;
  return formatCommercialAmount(offer.unitPriceMinor, locale, offer.currency);
}

export async function upgradeOfferValues(plan: PurchasablePlanId): Promise<{ price: string }> {
  return { price: upgradeOfferPrice(plan, await currentLocale()) };
}
