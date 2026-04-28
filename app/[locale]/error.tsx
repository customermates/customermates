"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";

import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardFooter } from "@/components/card/app-card-footer";
import { AppLink } from "@/components/shared/app-link";
import { CardHeroHeader } from "@/components/card/card-hero-header";
import { CenteredCardPage } from "@/components/shared/centered-card-page";
import { Button } from "@/components/ui/button";

type Props = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ErrorPage({ error, reset }: Props) {
  const t = useTranslations("ErrorCard");

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <CenteredCardPage>
      <AppCard className="max-w-md">
        <CardHeroHeader subtitle={t("subtitle")} title={t("title")} />

        <AppCardBody>
          <p className="text-x-sm text-center">{t("contactSupport")}</p>
        </AppCardBody>

        <AppCardFooter className="flex-col">
          <Button className="w-full" variant="outline" onClick={() => reset()}>
            {t("retry")}
          </Button>

          <Button asChild className="w-full" variant="destructive">
            <AppLink href="/">{t("ctaLabel")}</AppLink>
          </Button>
        </AppCardFooter>
      </AppCard>
    </CenteredCardPage>
  );
}
