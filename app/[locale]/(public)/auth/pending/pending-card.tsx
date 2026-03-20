"use client";

import { useEffect } from "react";
import { Button } from "@heroui/button";
import { useTranslations } from "next-intl";

import { XCard } from "@/components/x-card/x-card";
import { XCardBody } from "@/components/x-card/x-card-body";
import { XCardFooter } from "@/components/x-card/x-card-footer";
import { XCardHeroHeader } from "@/components/x-card/x-card-hero-header";
import { XPageCenter } from "@/components/x-layout-primitives/x-page-center";
import { checkPendingStatusAndRedirect } from "@/app/[locale]/actions";

export function PendingCard() {
  const t = useTranslations("");

  useEffect(() => void checkPendingStatusAndRedirect(), []);

  return (
    <XPageCenter>
      <XCard className="max-w-md">
        <XCardHeroHeader subtitle={t("PendingCard.subtitle")} title={t("PendingCard.title")} />

        <XCardBody>
          <p className="text-x-sm text-center">{t("PendingCard.body")}</p>
        </XCardBody>

        <XCardFooter>
          <Button className="w-full" color="primary" onPress={() => void checkPendingStatusAndRedirect()}>
            {t("Common.actions.refresh")}
          </Button>
        </XCardFooter>
      </XCard>
    </XPageCenter>
  );
}
