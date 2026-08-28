import type { Hero } from "@/core/fumadocs/schemas/homepage";

import { ArrowDownRight, ArrowUpRight } from "lucide-react";

import { AgplGithubBadge } from "@/components/marketing/agpl-github-badge";
import { MarketingContainer } from "@/components/marketing/marketing-container";
import { ProviderMark } from "@/components/marketing/visuals/native-visual-primitives";
import { VISUAL_PROVIDER_SET_FIXTURES } from "@/components/marketing/visuals/native-fixtures";
import { AppLink } from "@/components/shared/app-link";
import { Button } from "@/components/ui/button";

type Props = {
  heroSection: Hero;
};

const SUPPORTED_INBOX_PROVIDERS = VISUAL_PROVIDER_SET_FIXTURES["unified-inbox"].providers;

export function HomepageHero({ heroSection }: Props) {
  return (
    <section className="relative isolate w-full overflow-hidden" data-homepage-section="hero">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 opacity-40 [background-image:linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] [background-size:56px_56px] [mask-image:linear-gradient(to_bottom,black_0%,black_38%,transparent_94%)]"
      />

      <MarketingContainer className="relative z-10">
        <div className="flex flex-col items-center py-16 text-center sm:py-20 lg:py-28">
          <AgplGithubBadge />

          <h1 className="text-hero mt-7 max-w-6xl">
            {/* eslint-disable react/jsx-newline */}
            {heroSection.title} {heroSection.titleAccent ? <span>{heroSection.titleAccent}</span> : null}
            {/* eslint-enable react/jsx-newline */}
          </h1>

          <div className="mt-10 w-full max-w-[820px] rounded-card border border-border bg-card p-5 text-left shadow-[0_20px_70px_-48px_rgba(0,0,0,0.7)] sm:p-6">
            <p className="max-w-[700px] text-[15px] leading-relaxed text-muted-foreground sm:text-base">
              {heroSection.subtitle}
            </p>

            <div className="mt-7 flex items-end justify-between gap-4">
              <ul className="flex min-w-0 flex-1 flex-wrap items-center gap-2 sm:gap-2.5">
                {SUPPORTED_INBOX_PROVIDERS.map((provider) => (
                  <li
                    key={provider}
                    className="grid size-9 place-items-center rounded-full border border-border bg-background sm:size-10"
                  >
                    <ProviderMark provider={provider} size={21} />
                  </li>
                ))}
              </ul>

              <Button asChild className="size-11 shrink-0 rounded-full p-0" size="icon-lg">
                <AppLink aria-label={heroSection.buttonLeftText} href={heroSection.buttonLeftHref}>
                  <ArrowUpRight aria-hidden className="size-5" />
                </AppLink>
              </Button>
            </div>
          </div>

          <div className="mt-6 flex w-full max-w-[820px] flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
            <Button asChild size="lg">
              <AppLink href={heroSection.buttonLeftHref}>
                {heroSection.buttonLeftText}

                <ArrowUpRight aria-hidden className="size-4" />
              </AppLink>
            </Button>

            <Button asChild size="lg" variant="secondary">
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

          <p className="text-meta mt-5">{heroSection.startFree}</p>
        </div>
      </MarketingContainer>
    </section>
  );
}
