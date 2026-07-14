"use client";

import type { SelectablePlan } from "@/app/[locale]/(protected)/company/components/subscription/plan-picker";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardFooter } from "@/components/card/app-card-footer";
import { CardHeroHeader } from "@/components/card/card-hero-header";
import { useRootStore } from "@/core/stores/root-store.provider";

import { PlanPicker } from "@/app/[locale]/(protected)/company/components/subscription/plan-picker";

export const SubscriptionExpiredView = observer(() => {
  const t = useTranslations();
  const { subscriptionExpiredStore, loadingOverlayStore } = useRootStore();

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
        <p className="text-x-sm text-center text-subdued">{t("SubscriptionExpiredView.description")}</p>

        <PlanPicker isLoading={loadingOverlayStore.isLoading} onSelect={handleSelectPlan} />
      </AppCardBody>

      <AppCardFooter>
        <div className="flex w-full items-start">
          <Button className="w-full" variant="outline" onClick={handleContactSupport}>
            {t("SubscriptionExpiredView.contactSupportCta")}
          </Button>
        </div>
      </AppCardFooter>
    </AppCard>
  );
});
