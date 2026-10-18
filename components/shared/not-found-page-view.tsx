import { ArrowUpRight } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardFooter } from "@/components/card/app-card-footer";
import { CardHeroHeader } from "@/components/card/card-hero-header";
import { AppLink } from "@/components/shared/app-link";
import { CenteredCardPage } from "@/components/shared/centered-card-page";
import { GridPattern } from "@/components/shared/grid-pattern";
import { MarketingContainer } from "@/components/marketing/marketing-container";
import { Button } from "@/components/ui/button";

type Props = {
  locale?: string;
  variant?: "card" | "marketing";
};

export async function NotFoundPageView({ locale, variant = "card" }: Props = {}) {
  const t = await getTranslations(locale ? { locale } : undefined);

  if (variant === "marketing") {
    return (
      <section className="relative isolate w-full overflow-hidden bg-background" data-not-found="marketing">
        <title>{t("NotFoundPage.documentTitle")}</title>

        <meta content="noindex" name="robots" />

        <GridPattern className="z-0" fade="bottom" />

        <MarketingContainer className="relative z-10 flex min-h-[70svh] flex-col items-center justify-center py-24 text-center">
          <p className="text-eyebrow">{t("NotFoundPage.subtitle")}</p>

          <h1 className="text-display mt-5 max-w-3xl">{t("NotFoundPage.title")}</h1>

          <p className="text-lede mx-auto mt-6">{t("NotFoundPage.body")}</p>

          <div className="mt-8 flex w-full flex-col items-stretch gap-3 sm:w-auto sm:flex-row sm:items-center">
            <Button asChild size="lg">
              <AppLink href="/">
                {t("NotFoundPage.ctaLabel")}

                <ArrowUpRight aria-hidden className="size-4" />
              </AppLink>
            </Button>

            <Button asChild className="glass-surface" size="lg" variant="ghost">
              <AppLink href="/contact">{t("Common.actions.contact")}</AppLink>
            </Button>
          </div>
        </MarketingContainer>
      </section>
    );
  }

  return (
    <CenteredCardPage>
      <title>{t("NotFoundPage.documentTitle")}</title>

      <meta content="noindex" name="robots" />

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
