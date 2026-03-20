"use client";

import { useTranslations } from "next-intl";
import { observer } from "mobx-react-lite";
import { Button } from "@heroui/button";
import { useSearchParams } from "next/navigation";

import { XCard } from "@/components/x-card/x-card";
import { XCardBody } from "@/components/x-card/x-card-body";
import { XLink } from "@/components/x-link";
import { XCardFooter } from "@/components/x-card/x-card-footer";
import { XCardHeroHeader } from "@/components/x-card/x-card-hero-header";

export const ErrorCard = observer(() => {
  const t = useTranslations("ErrorCard");
  const errorKey = useSearchParams().get("type");

  return (
    <XCard className="max-w-md">
      <XCardHeroHeader subtitle={t("subtitle")} title={t("title")} />

      <XCardBody>
        <p className="text-x-sm text-center">{errorKey ? t(errorKey) : t("contactSupport")}</p>
      </XCardBody>

      <XCardFooter>
        <Button as={XLink} className="w-full" color="danger" href="/">
          {t("ctaLabel")}
        </Button>
      </XCardFooter>
    </XCard>
  );
});
