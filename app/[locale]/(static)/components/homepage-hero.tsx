import type { Hero } from "@/core/fumadocs/schemas/homepage";
import type { ContentLocale } from "@/i18n/locale-registry";

import { ArrowDownRight, ArrowUpRight } from "lucide-react";

import { AgplGithubBadge } from "@/components/marketing/agpl-github-badge";
import { MarketingContainer } from "@/components/marketing/marketing-container";
import { AppLink } from "@/components/shared/app-link";
import { GridPattern } from "@/components/shared/grid-pattern";
import { Button } from "@/components/ui/button";

import { homepageDemoBaseUrl } from "./homepage-demo-url";
import { HomepageHeroMarks } from "./homepage-hero-marks";
import { HomepageProductStage } from "./homepage-product-stage";
import { RotatingAccent } from "./rotating-accent";

type Props = {
  heroSection: Hero;
  locale: ContentLocale;
};

export function HomepageHero({ heroSection, locale }: Props) {
  return (
    <section className="relative isolate w-full overflow-hidden" data-homepage-section="hero">
      <GridPattern className="z-0" fade="bottom" />

      <HomepageHeroMarks />

      <MarketingContainer className="relative z-10 pt-28 pb-6 sm:pt-32 lg:pt-24">
        <div
          className="mx-auto flex max-w-[60rem] flex-col items-center text-center"
          data-homepage-hero-layout="centered"
        >
          <AgplGithubBadge className="!mb-0" />

          <h1
            className="mt-6 text-[clamp(2.25rem,6.4vw,4.75rem)] leading-[1.04] font-medium tracking-[-0.045em] text-balance"
            data-homepage-hero-line="lead"
          >
            <span className="sr-only">
              {`${heroSection.titleRotations[0]} ${heroSection.title} ${heroSection.titleAccent}`}
            </span>

            <RotatingAccent
              highlightClassName="rounded-[0.32em] bg-primary/10 pt-[0.12em] pr-[0.2em] pb-[0.19em] pl-[0.16em] text-primary ring-1 ring-primary/15 ring-inset"
              words={heroSection.titleRotations}
            />

            <span
              aria-hidden
              className="block bg-linear-to-b from-foreground to-foreground/65 bg-clip-text pb-[0.06em] text-transparent"
              data-homepage-hero-line="accent"
            >
              <span className="block">{heroSection.title}</span>

              <span className="block">{heroSection.titleAccent}</span>
            </span>
          </h1>

          <p className="mt-6 max-w-[40rem] text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
            {heroSection.useCase}
          </p>

          <div className="mt-8 flex w-full flex-col items-stretch gap-3 sm:w-auto sm:flex-row sm:items-center">
            <Button asChild size="lg">
              <AppLink href={heroSection.buttonLeftHref}>
                {heroSection.buttonLeftText}

                <ArrowUpRight aria-hidden className="size-4" />
              </AppLink>
            </Button>

            <Button asChild className="glass-surface" size="lg" variant="ghost">
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

        <HomepageProductStage
          demoBaseUrl={homepageDemoBaseUrl()}
          label={heroSection.stage.label}
          live={heroSection.stage.live}
          locale={locale}
          tabs={heroSection.stage.tabs}
        />
      </MarketingContainer>
    </section>
  );
}
