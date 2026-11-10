"use client";

import type { PurchasablePlanId } from "@/core/commercial/plan-catalog";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { IntlLink } from "@/i18n/navigation";
import { billingHref } from "@/app/components/navigation/settings-routes";
import { serverRenderedClient } from "@/core/utils/server-rendered-client";

import { useCanChangePlan } from "./use-can-change-plan";

type Props = {
  plan: PurchasablePlanId;
  onNavigate?: () => void;
};

const UpsellCtaContent = observer(function UpsellCtaContent({ plan, onNavigate }: Props) {
  const t = useTranslations();
  const canChangePlan = useCanChangePlan();
  const planName = t(`Subscription.planNames.${plan}`);

  if (!canChangePlan) {
    return (
      <p className="text-x-sm w-full text-center text-subdued" data-upsell-ask-admin="" data-upsell-plan-target={plan}>
        {t("Upsell.askAdmin", { plan: planName })}
      </p>
    );
  }

  return (
    <Button asChild className="w-full" variant="ink">
      <IntlLink data-upsell-plan-target={plan} href={billingHref(plan)} onClick={onNavigate}>
        {t("Upsell.upgradeTo", { plan: planName })}
      </IntlLink>
    </Button>
  );
});

export const UpsellCta = serverRenderedClient(UpsellCtaContent);
