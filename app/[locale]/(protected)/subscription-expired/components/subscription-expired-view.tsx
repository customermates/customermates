"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardFooter } from "@/components/card/app-card-footer";
import { CardHeroHeader } from "@/components/card/card-hero-header";
import { useRootStore } from "@/core/stores/root-store.provider";

export const SubscriptionExpiredView = observer(() => {
  const t = useTranslations();
  const { subscriptionExpiredStore } = useRootStore();

  function handleContactSupport() {
    window.location.href = `mailto:mail@customermates.com?subject=${encodeURIComponent(t("SubscriptionExpiredView.supportEmailSubject"))}`;
  }

  return (
    <AppCard className="max-w-md">
      <CardHeroHeader subtitle={t("SubscriptionExpiredView.subtitle")} title={t("SubscriptionExpiredView.title")} />

      <AppCardBody>
        <p className="text-x-sm text-center text-subdued">{t("SubscriptionExpiredView.description")}</p>
      </AppCardBody>

      <AppCardFooter>
        <div className="flex w-full flex-col space-y-3 items-start">
          <Button className="w-full" onClick={() => void subscriptionExpiredStore.handleSubscribe()}>
            {t("SubscriptionExpiredView.subscribeCta")}
          </Button>

          <Button className="w-full" variant="outline" onClick={handleContactSupport}>
            {t("SubscriptionExpiredView.contactSupportCta")}
          </Button>
        </div>
      </AppCardFooter>
    </AppCard>
  );
});
