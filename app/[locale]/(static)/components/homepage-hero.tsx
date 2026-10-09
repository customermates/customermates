import type { Hero } from "@/core/fumadocs/schemas/homepage";
import type { ContentLocale } from "@/i18n/locale-registry";

import { ArrowDownRight, ArrowUpRight } from "lucide-react";

import { AgplGithubBadge } from "@/components/marketing/agpl-github-badge";
import { MarketingContainer } from "@/components/marketing/marketing-container";
import { AppLink } from "@/components/shared/app-link";
import { GridPattern } from "@/components/shared/grid-pattern";
import { Button } from "@/components/ui/button";

import { homepageDemoBaseUrl } from "./homepage-demo-url";
import { HomepageProductStage } from "./homepage-product-stage";

type Props = {
  heroSection: Hero;
  locale: ContentLocale;
};

export function HomepageHero({ heroSection, locale }: Props) {
  return (
    <section className="relative isolate w-full overflow-hidden" data-homepage-section="hero">
      <GridPattern className="z-0" fade="bottom" />

      <MarketingContainer className="relative z-10 pt-16 pb-6 sm:pt-20 lg:pt-24">
        <div className="grid gap-x-14 gap-y-8 lg:grid-cols-[1.2fr_1fr] lg:items-end">
          <div className="min-w-0">
            <AgplGithubBadge className="!mb-0" />

            <h1
              className="mt-5 text-[clamp(2.4rem,6.2vw,4.5rem)] leading-[1.04] font-medium tracking-[-0.045em] text-balance"
              data-homepage-hero-line="lead"
            >
              {/* eslint-disable react/jsx-newline */}
              {heroSection.title}{" "}
              <span className="text-muted-foreground" data-homepage-hero-line="accent">
                {heroSection.titleAccent}
              </span>
              {/* eslint-enable react/jsx-newline */}
            </h1>
          </div>

          <div className="min-w-0 lg:pb-2">
            <p className="text-base leading-7 text-muted-foreground sm:text-[1.05rem]">{heroSection.useCase}</p>

            <div className="mt-7 flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <Button asChild size="lg">
                <AppLink href={heroSection.buttonLeftHref}>
                  {heroSection.buttonLeftText}

                  <ArrowUpRight aria-hidden className="size-4" />
                </AppLink>
              </Button>

              <Button asChild className="border border-border" size="lg" variant="ghost">
                {heroSection.buttonRightHref.startsWith("#") ? (
                  <a href={heroSection.buttonRightHref}>
                    {heroSection.buttonRightText}

                    <ArrowDownRight aria-hidden className="size-4" />
                  </a>
                ) : (
                  <AppLink external href={heroSection.buttonRightHref}>
                    {heroSection.buttonRightText}
                  </AppLink>
                )}
              </Button>
            </div>

            <p className="text-meta mt-5 text-xs">{heroSection.startFree}</p>
          </div>
        </div>

        <HomepageProductStage
          demoBaseUrl={homepageDemoBaseUrl()}
          disclosure={heroSection.stage.disclosure}
          label={heroSection.stage.label}
          live={heroSection.stage.live}
          locale={locale}
          tabs={heroSection.stage.tabs}
        />
      </MarketingContainer>
    </section>
  );
}
