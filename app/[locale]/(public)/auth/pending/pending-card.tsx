"use client";

import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";

import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardFooter } from "@/components/card/app-card-footer";
import { CardHeroHeader } from "@/components/card/card-hero-header";

export function PendingCard() {
  const t = useTranslations();

  return (
    <AppCard className="max-w-md">
      <CardHeroHeader subtitle={t("PendingCard.subtitle")} title={t("PendingCard.title")} />

      <AppCardBody>
        <p className="text-x-sm text-center">{t("PendingCard.body")}</p>
      </AppCardBody>

      <AppCardFooter>
        <Button className="w-full" onClick={() => window.location.reload()}>
          {t("Common.actions.refresh")}
        </Button>
      </AppCardFooter>
    </AppCard>
  );
}
