"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { Button } from "@heroui/button";

import { XCard } from "@/components/x-card/x-card";
import { XCardBody } from "@/components/x-card/x-card-body";
import { XCardFooter } from "@/components/x-card/x-card-footer";
import { XCardHeroHeader } from "@/components/x-card/x-card-hero-header";
import { useRootStore } from "@/core/stores/root-store.provider";

export const SubscriptionExpiredCard = observer(() => {
  const t = useTranslations("SubscriptionExpiredCard");
  const { subscriptionExpiredCardStore } = useRootStore();

  function handleContactSupport() {
    window.location.href = `mailto:mail@customermates.com?subject=${encodeURIComponent(t("supportEmailSubject"))}`;
  }

  return (
    <XCard className="max-w-md">
      <XCardHeroHeader subtitle={t("subtitle")} title={t("title")} />

      <XCardBody>
        <p className="text-x-sm text-center text-subdued">{t("description")}</p>
      </XCardBody>

      <XCardFooter>
        <div className="flex w-full flex-col space-y-3 items-start">
          <Button
            className="w-full"
            color="primary"
            isLoading={subscriptionExpiredCardStore.checkoutLoading}
            onPress={() => void subscriptionExpiredCardStore.handleSubscribe()}
          >
            {t("subscribeCta")}
          </Button>

          <Button className="w-full" color="default" variant="bordered" onPress={handleContactSupport}>
            {t("contactSupportCta")}
          </Button>
        </div>
      </XCardFooter>
    </XCard>
  );
});
