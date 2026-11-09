"use client";

import type { SubscriptionDto } from "@/ee/subscription/get-subscription.interactor";

import { CreditCard } from "lucide-react";
import { useTranslations } from "next-intl";

import { SubscriptionStatus } from "@/generated/prisma";
import { Button } from "@/components/ui/button";
import { IntlLink } from "@/i18n/navigation";
import { settingsHref } from "@/app/components/navigation/settings-routes";

import { PlanBanner } from "./plan-banner";

type Props = {
  subscription: Pick<SubscriptionDto, "status" | "plan" | "onFreePlan"> | null;
  canOpenBilling: boolean;
};

const FAILED_PAYMENT_STATUSES = new Set<SubscriptionStatus>([SubscriptionStatus.pastDue, SubscriptionStatus.unPaid]);

export function PaymentFailedBanner({ subscription, canOpenBilling }: Props) {
  if (!subscription || subscription.onFreePlan || !canOpenBilling) return null;
  if (!FAILED_PAYMENT_STATUSES.has(subscription.status)) return null;
  return <FailedPaymentStrip plan={subscription.plan} />;
}

function FailedPaymentStrip({ plan }: { plan: SubscriptionDto["plan"] }) {
  const t = useTranslations();

  return (
    <PlanBanner
      action={
        <Button asChild size="sm" variant="ink">
          <IntlLink href={settingsHref("billing")}>{t("PlanBanner.reviewPayment")}</IntlLink>
        </Button>
      }
      data-payment-failed-banner=""
      icon={<CreditCard />}
      title={t("PlanBanner.paymentFailed", { plan: t(`Subscription.planNames.${plan}`) })}
      variant="destructive"
    />
  );
}
