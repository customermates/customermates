import type { Hero } from "@/core/fumadocs/schemas/homepage";

import { ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AgplGithubBadge } from "@/components/marketing/agpl-github-badge";
import { WaveDecoration } from "@/components/marketing/wave-decoration";

import { HeroDemoIframe } from "./hero-demo-iframe";

import { AppLink } from "@/components/shared/app-link";

type Props = {
  heroSection: Hero;
};

const germanyFlag = (
  <svg
    aria-label="Germany"
    className="ml-1 inline-block h-[0.85em] w-auto -translate-y-[0.08em] rounded-[2px] align-middle ring-1 ring-border"
    role="img"
    viewBox="0 0 5 3"
  >
    <rect fill="#000" height="1" width="5" y="0" />

    <rect fill="#dd0000" height="1" width="5" y="1" />

    <rect fill="#ffce00" height="1" width="5" y="2" />
  </svg>
);

export function HomepageHero({ heroSection }: Props) {
  return (
    <section className="relative isolate w-full overflow-hidden pt-16 pb-14 md:pt-24 md:pb-16">
      <WaveDecoration
        className="-top-20 -left-40 w-[min(900px,92vw)] md:-top-20 md:-left-40"
        opacity={0.25}
        variant="wave-1"
      />

      <WaveDecoration
        className="top-5 right-0 hidden w-[min(620px,55vw)] md:block md:-right-20 md:top-5"
        opacity={0.3}
        variant="wave-2"
      />

      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-5 bg-[radial-gradient(ellipse_60%_60%_at_50%_35%,var(--background)_0%,transparent_70%)]"
      />

      <div className="relative z-10 flex w-full flex-col items-center">
        <div className="mx-auto flex w-full max-w-[1000px] flex-col items-center px-4 text-center">
          <AgplGithubBadge />

          <h1 className="m-0 max-w-[900px] bg-[linear-gradient(to_bottom,#171717,#262626_45%,#525252)] bg-clip-text text-[40px] font-bold leading-[1.02] tracking-[-0.035em] text-transparent sm:text-[52px] md:text-[64px] dark:bg-[linear-gradient(to_bottom,#fafafa,#e5e5e5_45%,#a3a3a3)]">
            {heroSection.title}
          </h1>

          {heroSection.titleAccent ? (
            <div
              className="mt-3 text-[26px] italic text-primary sm:text-[32px] md:text-[36px] tracking-[-0.02em]"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              {heroSection.titleAccent}
            </div>
          ) : null}

          <p className="mx-auto mt-6 max-w-[680px] text-[15px] leading-normal text-muted-foreground md:text-[17px]">
            {/* eslint-disable-next-line react/jsx-newline */}
            {heroSection.subtitle} {germanyFlag}
          </p>

          <div className="my-8 flex flex-col items-center gap-3 sm:flex-row sm:gap-4">
            <Button asChild className="w-full shadow-[0_6px_14px_-4px_rgba(94,74,227,0.45)] sm:w-auto" size="lg">
              <AppLink href={heroSection.buttonLeftHref}>{heroSection.buttonLeftText}</AppLink>
            </Button>

            <Button asChild className="w-full sm:w-auto" size="lg" variant="outline">
              {heroSection.buttonRightHref.startsWith("#") ? (
                <a href={heroSection.buttonRightHref}>
                  {heroSection.buttonRightText}

                  <ChevronDown className="size-4" />
                </a>
              ) : (
                <AppLink external href={heroSection.buttonRightHref}>
                  {heroSection.buttonRightText}
                </AppLink>
              )}
            </Button>
          </div>

          <p className="mb-6 text-xs text-muted-foreground">{heroSection.startFree}</p>
        </div>

        <div className="w-full px-4">
          <HeroDemoIframe />
        </div>
      </div>
    </section>
  );
}
