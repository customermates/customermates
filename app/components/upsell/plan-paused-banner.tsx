"use client";

import type { SubscriptionDto } from "@/ee/subscription/get-subscription.interactor";

import { UserRoundX } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { IntlLink } from "@/i18n/navigation";
import { billingHref } from "@/app/components/navigation/settings-routes";
import { FREE_PLAN_UPGRADE_PLAN } from "@/core/commercial/plan-catalog";

import { PlanBanner } from "./plan-banner";
import { UpsellPlanPrice } from "./upsell-plan-price";

type Props = {
  subscription: Pick<SubscriptionDto, "onFreePlan" | "pausedMembers"> | null;
};

export function PlanPausedBanner({ subscription }: Props) {
  if (!subscription?.onFreePlan || subscription.pausedMembers <= 0) return null;
  return <PausedMembersBanner count={subscription.pausedMembers} />;
}

function PausedMembersBanner({ count }: { count: number }) {
  const t = useTranslations();
  const plan = FREE_PLAN_UPGRADE_PLAN;
  const planName = t(`Subscription.planNames.${plan}`);

  return (
    <PlanBanner
      action={
        <Button asChild size="sm" variant="ink">
          <IntlLink href={billingHref(plan)}>{t("Upsell.upgradeTo", { plan: planName })}</IntlLink>
        </Button>
      }
      data-plan-paused-banner=""
      description={<UpsellPlanPrice plan={plan} />}
      icon={<UserRoundX />}
      title={t("PlanPause.banner", { count, plan: planName })}
    />
  );
}
