"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { IntlLink } from "@/i18n/navigation";
import { billingHref } from "@/app/components/navigation/settings-routes";
import { FREE_PLAN_ID } from "@/core/commercial/plan-catalog";
import { nextStoragePlan } from "@/core/commercial/plan-fit";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { useRootStore } from "@/core/stores/root-store.provider";

import { useCanChangePlan } from "./use-can-change-plan";

export function isStorageQuotaFailure(code: string | undefined): boolean {
  return code === CustomErrorCode.storageQuotaExceeded || code === CustomErrorCode.storageQuotaExceededTopPlan;
}

export const StorageFailureAction = observer(function StorageFailureAction() {
  const t = useTranslations();
  const { subscriptionStore } = useRootStore();
  const canChangePlan = useCanChangePlan();
  const subscription = subscriptionStore.subscription;
  const next = nextStoragePlan(subscription ? (subscription.onFreePlan ? FREE_PLAN_ID : subscription.plan) : null);

  if (!next) return null;
  const planName = t(`Subscription.planNames.${next}`);

  return canChangePlan ? (
    <IntlLink
      className="text-xs text-foreground underline underline-offset-2"
      data-storage-upgrade={next}
      href={billingHref(next)}
    >
      {t("Subscription.picker.choose", { plan: planName })}
    </IntlLink>
  ) : (
    <span className="text-xs text-muted-foreground" data-upsell-ask-admin="">
      {t("Upsell.askAdmin", { plan: planName })}
    </span>
  );
});
