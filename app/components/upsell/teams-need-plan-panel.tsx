"use client";

import { Users } from "lucide-react";
import { useTranslations } from "next-intl";

import { FREE_PLAN_UPGRADE_PLAN } from "@/core/commercial/plan-catalog";

import { PlanUpsellNotice } from "./plan-upsell-notice";

type Props = {
  onNavigate?: () => void;
};

export function TeamsNeedPlanPanel({ onNavigate }: Props) {
  const t = useTranslations();
  const plan = FREE_PLAN_UPGRADE_PLAN;
  const planName = t(`Subscription.planNames.${plan}`);

  return (
    <PlanUpsellNotice
      stacked
      data-plan-limit="members"
      data-teams-need-plan=""
      detail={t("PlanUsage.teamsDescription", { plan: planName })}
      icon={<Users />}
      id="teams"
      plan={plan}
      title={t("PlanUsage.teamsTitle", { plan: planName })}
      onNavigate={onNavigate}
    />
  );
}
