"use client";

import type { SelectablePlan } from "@/app/[locale]/(protected)/company/components/subscription/plan-picker";
import type { SubscriptionRecoveryPath } from "@/features/auth/subscription-recovery";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardFooter } from "@/components/card/app-card-footer";
import { CardHeroHeader } from "@/components/card/card-hero-header";
import { useRootStore } from "@/core/stores/root-store.provider";

import { PlanPicker } from "@/app/[locale]/(protected)/company/components/subscription/plan-picker";

export const SubscriptionExpiredView = observer(({ recoveryPath }: { recoveryPath: SubscriptionRecoveryPath }) => {
  const t = useTranslations();
  const { subscriptionExpiredStore, loadingOverlayStore } = useRootStore();
  const description =
    recoveryPath === "selfServiceCheckout"
      ? t("SubscriptionExpiredView.selfServiceCheckoutDescription")
      : recoveryPath === "manualEnterpriseBilling"
        ? t("SubscriptionExpiredView.manualEnterpriseBillingDescription")
        : t("SubscriptionExpiredView.administratorRequiredDescription");

  function handleContactSupport() {
    window.location.href = `mailto:mail@customermates.com?subject=${encodeURIComponent(t("SubscriptionExpiredView.supportEmailSubject"))}`;
  }

  function handleSelectPlan(plan: SelectablePlan) {
    void subscriptionExpiredStore.handleSubscribe(plan);
  }

  return (
    <AppCard className="max-w-3xl">
      <CardHeroHeader subtitle={t("SubscriptionExpiredView.subtitle")} title={t("SubscriptionExpiredView.title")} />

      <AppCardBody>
        <p className="text-x-sm text-center text-subdued">{description}</p>

        {recoveryPath === "selfServiceCheckout" ? (
          <PlanPicker isLoading={loadingOverlayStore.isLoading} onSelect={handleSelectPlan} />
        ) : null}
      </AppCardBody>

      <AppCardFooter>
        <div
          className={
            recoveryPath === "selfServiceCheckout"
              ? "grid w-full grid-cols-1 gap-2"
              : "grid w-full grid-cols-1 gap-2 sm:grid-cols-2"
          }
        >
          <Button className="w-full" variant="outline" onClick={handleContactSupport}>
            {t("SubscriptionExpiredView.contactSupportCta")}
          </Button>

          {recoveryPath !== "selfServiceCheckout" ? (
            <Button className="w-full" onClick={() => window.location.reload()}>
              {t("SubscriptionExpiredView.retry")}
            </Button>
          ) : null}
        </div>
      </AppCardFooter>
    </AppCard>
  );
});
