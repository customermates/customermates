"use client";

import { useTranslations } from "next-intl";

import { serverRenderedClient } from "@/core/utils/server-rendered-client";
import { FREE_PLAN_UPGRADE_PLAN } from "@/core/commercial/plan-catalog";

import { PlanUpsellNotice } from "./plan-upsell-notice";

function RoutinesPausedNoticeContent() {
  const t = useTranslations();
  const planName = t(`Subscription.planNames.${FREE_PLAN_UPGRADE_PLAN}`);

  return (
    <div className="px-4 pt-3 md:px-6">
      <PlanUpsellNotice
        compact
        detail={t("Upsell.locked.routines.description", { plan: planName })}
        id="routines-paused"
        plan={FREE_PLAN_UPGRADE_PLAN}
        title={t("Upsell.locked.routines.title", { plan: planName })}
      />
    </div>
  );
}

export const RoutinesPausedNotice = serverRenderedClient(RoutinesPausedNoticeContent);
