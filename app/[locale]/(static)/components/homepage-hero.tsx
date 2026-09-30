import type { Hero } from "@/core/fumadocs/schemas/homepage";

import { ArrowDownRight, ArrowUpRight } from "lucide-react";

import { AgplGithubBadge } from "@/components/marketing/agpl-github-badge";
import { MarketingContainer } from "@/components/marketing/marketing-container";
import { AppLink } from "@/components/shared/app-link";
import { GridPattern } from "@/components/shared/grid-pattern";
import { Button } from "@/components/ui/button";

import { HomepageHeroVisual } from "./homepage-hero-visual";

import { RotatingAccent } from "./rotating-accent";

type Props = {
  heroSection: Hero;
};

export function HomepageHero({ heroSection }: Props) {
  const accentRotations = heroSection.titleAccentRotations?.length
    ? heroSection.titleAccentRotations
    : heroSection.titleAccent
      ? [heroSection.titleAccent]
      : [];
  const headlineAccent = accentRotations[0];

  return (
    <section className="relative isolate w-full overflow-hidden" data-homepage-section="hero">
      <GridPattern className="z-0" fade="bottom" />

      <MarketingContainer className="relative z-10 !max-w-[72rem] !px-6 sm:!px-12 lg:!px-10">
        <div className="grid items-center gap-12 py-20 sm:py-24 lg:grid-cols-[1.2fr_1fr] lg:gap-12 lg:py-28">
          <div className="min-w-0 [container-type:inline-size]">
            <AgplGithubBadge className="!mb-0" />

            <div className="mt-4 text-[clamp(1.5rem,8.8cqw,4rem)] leading-[1.07] font-medium tracking-[-0.045em]">
              <div className="flex flex-col items-start gap-y-[0.1em]">
                <h1 className="text-balance whitespace-nowrap" data-homepage-hero-line="lead">
                  {heroSection.title}

                  {headlineAccent ? <span className="sr-only">{` ${headlineAccent}`}</span> : null}
                </h1>

                <span
                  aria-hidden
                  className="inline-flex max-w-full whitespace-nowrap text-[0.87em]"
                  data-homepage-hero-line="rotation"
                >
                  <RotatingAccent
                    activeClassName="rounded-xl bg-primary/10 px-[0.12em]"
                    className="p-[0.12em] text-primary [&>span]:justify-start"
                    words={accentRotations}
                  />
                </span>
              </div>
            </div>

            <div className="mt-7 max-w-[30rem]">
              <p className="text-base leading-7 text-muted-foreground">{heroSection.useCase}</p>
            </div>

            <div className="mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center">
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

          {heroSection.illustration ? <HomepageHeroVisual copy={heroSection.illustration} /> : null}
        </div>
      </MarketingContainer>
    </section>
  );
}
