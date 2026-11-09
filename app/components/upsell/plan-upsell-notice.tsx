"use client";

import type { ReactNode } from "react";
import type { PurchasablePlanId } from "@/core/commercial/plan-catalog";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { Alert } from "@/components/shared/alert";
import { Button } from "@/components/ui/button";
import { IntlLink } from "@/i18n/navigation";
import { cn } from "@/core/utils/cn";
import { billingHref } from "@/app/components/navigation/settings-routes";

import { UpsellPlanPrice } from "./upsell-plan-price";
import { useCanChangePlan } from "./use-can-change-plan";

type Props = {
  id: string;
  plan: PurchasablePlanId;
  title: ReactNode;
  detail?: ReactNode;
  className?: string;
  compact?: boolean;
  stacked?: boolean;
  icon?: ReactNode;
  onNavigate?: () => void;
} & Record<`data-${string}`, string>;

export const PlanUpsellNotice = observer(function PlanUpsellNotice({
  id,
  plan,
  title,
  detail,
  className,
  compact = false,
  stacked = false,
  icon,
  onNavigate,
  ...data
}: Props) {
  const t = useTranslations();
  const canChangePlan = useCanChangePlan();
  const planName = t(`Subscription.planNames.${plan}`);

  return (
    <Alert
      {...data}
      action={
        canChangePlan ? (
          <Button asChild size={compact ? "xs" : "sm"} variant="ink">
            <IntlLink href={billingHref(plan)} onClick={onNavigate}>
              {t("Upsell.upgradeTo", { plan: planName })}
            </IntlLink>
          </Button>
        ) : undefined
      }
      className={cn(compact && "gap-2.5 px-3 py-2.5 text-xs", className)}
      data-upsell-notice={id}
      data-upsell-plan-target={plan}
      description={
        <>
          {detail ? <span className="block">{detail}</span> : null}

          <span className="block">
            <UpsellPlanPrice plan={plan} />
          </span>

          {canChangePlan ? null : (
            <span className="block" data-upsell-ask-admin="">
              {t("Upsell.askAdmin", { plan: planName })}
            </span>
          )}
        </>
      }
      icon={icon}
      role="status"
      stacked={compact || stacked}
      title={title}
      variant="upsell"
    />
  );
});
