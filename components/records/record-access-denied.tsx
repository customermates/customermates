import { useTranslations } from "next-intl";

import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { CardHeroHeader } from "@/components/card/card-hero-header";
import { AppLink } from "@/components/shared/app-link";
import { CenteredCardPage } from "@/components/shared/centered-card-page";
import { Button } from "@/components/ui/button";
import { RecordUnavailableBreadcrumb } from "./record-unavailable-breadcrumb";

export function RecordAccessDeniedPage() {
  const t = useTranslations();

  return (
    <CenteredCardPage>
      <RecordUnavailableBreadcrumb kind="denied" />

      <title>{t("AccessDeniedPage.documentTitle")}</title>

      <AppCard className="max-w-md" data-access-denied="">
        <CardHeroHeader subtitle={t("AccessDeniedPage.subtitle")} title={t("AccessDeniedPage.title")} />

        <AppCardBody className="flex flex-col gap-4">
          <p className="text-x-sm text-center">{t("AccessDeniedPage.body")}</p>

          <Button asChild className="w-full">
            <AppLink href="/">{t("AccessDeniedPage.ctaLabel")}</AppLink>
          </Button>
        </AppCardBody>
      </AppCard>
    </CenteredCardPage>
  );
}

export function RecordAccessDeniedNotice() {
  const t = useTranslations();

  return (
    <div className="flex flex-col gap-2 p-6" data-access-denied="">
      <p className="text-sm font-medium">{t("AccessDeniedPage.subtitle")}</p>

      <p className="text-sm text-muted-foreground">{t("AccessDeniedPage.body")}</p>
    </div>
  );
}
