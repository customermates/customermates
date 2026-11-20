"use client";

import type { PlanId } from "@/core/commercial/plan-catalog";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { useRootStore } from "@/core/stores/root-store.provider";
import { serverRenderedClient } from "@/core/utils/server-rendered-client";
import { PLAN_CATALOG } from "@/core/commercial/plan-catalog";

import { nextRoutinePlan, routineAllowanceLabel } from "./plan-upsell-highlights";
import { PlanUpsellNotice } from "./plan-upsell-notice";

type Props = {
  plan: PlanId | null;
  initialOwnerUserIds: ReadonlyArray<string | null>;
};

const RoutineAllowanceNoticeContent = observer(function RoutineAllowanceNoticeContent({
  plan,
  initialOwnerUserIds,
}: Props) {
  const t = useTranslations();
  const { automationsStore, userStore } = useRootStore();
  const nextPlan = nextRoutinePlan(plan);
  const userId = userStore.user?.id;
  if (!plan || !nextPlan || !userId) return null;
  const allowance = PLAN_CATALOG[plan].entitlements.includedRoutinesPerUser;
  if (allowance === "unlimited" || allowance <= 0) return null;
  const ownerUserIds = automationsStore.isReady
    ? automationsStore.items.filter((item) => item.kind === "routine").map((item) => item.ownerUserId)
    : initialOwnerUserIds;
  const owned = ownerUserIds.filter((ownerUserId) => ownerUserId === userId).length;
  if (owned < allowance) return null;

  return (
    <div className="px-4 pt-3 md:px-6">
      <PlanUpsellNotice
        detail={routineAllowanceLabel(nextPlan, t)}
        id="routines"
        plan={nextPlan}
        title={t("Upsell.routines.reachedTitle", { plan: t(`Subscription.planNames.${plan}`) })}
      />
    </div>
  );
});

export const RoutineAllowanceNotice = serverRenderedClient(RoutineAllowanceNoticeContent);
