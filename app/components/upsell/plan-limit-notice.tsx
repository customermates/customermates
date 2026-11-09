"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { IntlLink } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/shared/alert";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { billingHref } from "@/app/components/navigation/settings-routes";
import { serverRenderedClient } from "@/core/utils/server-rendered-client";
import { FREE_PLAN_UPGRADE_PLAN } from "@/core/commercial/plan-catalog";

import { PlanBanner } from "./plan-banner";
import { UpsellPlanPrice } from "./upsell-plan-price";
import { planUsageLevel } from "./plan-usage-meter";
import { useCanChangePlan } from "./use-can-change-plan";

type Props = {
  kind: "records" | "members";
  used: number;
  limit: number;
  className?: string;
  alwaysShow?: boolean;
};

const PlanLimitNoticeContent = observer(function PlanLimitNoticeContent({
  kind,
  used,
  limit,
  className,
  alwaysShow = false,
}: Props) {
  const t = useTranslations();
  const canChangePlan = useCanChangePlan();
  const intlStore = useHydratedIntlStore();
  const level = planUsageLevel(used, limit);
  const values = { used: intlStore.formatNumber(used), limit: intlStore.formatNumber(limit) };
  const message =
    kind === "records"
      ? level === "reached"
        ? t("PlanUsage.recordsReached", values)
        : level === "approaching"
          ? t("PlanUsage.recordsApproaching", values)
          : null
      : level === "reached" || alwaysShow
        ? t("PlanUsage.membersReached", values)
        : null;
  if (!message) return null;
  const plan = FREE_PLAN_UPGRADE_PLAN;
  const planName = t(`Subscription.planNames.${plan}`);

  const action = canChangePlan ? (
    <Button asChild size="sm" variant="ink">
      <IntlLink href={billingHref(plan)}>{t("Upsell.upgradeTo", { plan: planName })}</IntlLink>
    </Button>
  ) : undefined;
  const description = (
    <>
      <span className="block">
        <UpsellPlanPrice plan={plan} />
      </span>

      {canChangePlan ? null : (
        <span className="block" data-upsell-ask-admin="">
          {t("Upsell.askAdmin", { plan: planName })}
        </span>
      )}
    </>
  );

  if (level === "reached") {
    return (
      <PlanBanner
        action={action}
        data-plan-limit={kind}
        data-usage-level={level}
        description={description}
        title={message}
        variant="warning"
      />
    );
  }

  return (
    <Alert
      action={action}
      className={className}
      data-plan-limit={kind}
      data-usage-level={level}
      description={description}
      role="status"
      title={message}
      variant="upsell"
    />
  );
});

export const PlanLimitNotice = serverRenderedClient(PlanLimitNoticeContent);
