import { getTranslations } from "next-intl/server";

import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardFooter } from "@/components/card/app-card-footer";
import { CardHeroHeader } from "@/components/card/card-hero-header";
import { AppLink } from "@/components/shared/app-link";
import { CenteredCardPage } from "@/components/shared/centered-card-page";
import { Button } from "@/components/ui/button";

export async function NotFoundPageView() {
  const t = await getTranslations();

  return (
    <CenteredCardPage>
      <AppCard className="max-w-md">
        <CardHeroHeader subtitle={t("NotFoundPage.subtitle")} title={t("NotFoundPage.title")} />

        <AppCardBody>
          <p className="text-x-sm text-center">{t("NotFoundPage.body")}</p>
        </AppCardBody>

        <AppCardFooter>
          <Button asChild className="w-full">
            <AppLink href="/">{t("NotFoundPage.ctaLabel")}</AppLink>
          </Button>
        </AppCardFooter>
      </AppCard>
    </CenteredCardPage>
  );
}
