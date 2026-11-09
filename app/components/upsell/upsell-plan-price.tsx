"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { serverRenderedClient } from "@/core/utils/server-rendered-client";
import { formatCommercialAmount, PLAN_CATALOG, type PurchasablePlanId } from "@/core/commercial/plan-catalog";

type Props = {
  plan: PurchasablePlanId;
};

const UpsellPlanPriceContent = observer(function UpsellPlanPriceContent({ plan }: Props) {
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();
  const offer = PLAN_CATALOG[plan].offers.monthly;

  return (
    <span data-upsell-plan={plan}>
      {t("Upsell.planPrice", {
        plan: t(`Subscription.planNames.${plan}`),
        price: formatCommercialAmount(offer.unitPriceMinor, intlStore.resolvedFormattingLanguageTag, offer.currency),
      })}
    </span>
  );
});

export const UpsellPlanPrice = serverRenderedClient(UpsellPlanPriceContent);
