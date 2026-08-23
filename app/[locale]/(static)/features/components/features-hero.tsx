import type { Hero } from "@/core/fumadocs/schemas/features";

import { Button } from "@/components/ui/button";
import { AgplGithubBadge } from "@/components/marketing/agpl-github-badge";
import { MarketingContainer } from "@/components/marketing/marketing-container";

import { AppLink } from "@/components/shared/app-link";

type Props = Hero;

export function FeaturesHero({
  buttonLeftHref,
  buttonLeftText,
  buttonRightHref,
  buttonRightText,
  description,
  title,
  titleAccent,
}: Props) {
  return (
    <section className="w-full pt-16 pb-12 sm:pb-16 md:pt-24">
      <MarketingContainer>
        <div className="flex flex-col items-center text-center">
          <AgplGithubBadge />

          {/* eslint-disable react/jsx-newline */}
          <h1 className="text-display m-0 max-w-5xl">
            {title} {titleAccent ? <span className="text-muted-foreground">{titleAccent}</span> : null}
          </h1>
          {/* eslint-enable react/jsx-newline */}

          <p className="text-lede mt-6">{description}</p>

          <div className="mt-9 flex w-full flex-col items-stretch justifyate-center gap-3 sm:w-auto sm:flex-row sm:items-center">
            <Button asChild size="lg">
              <AppLink href={buttonLeftHref}>{buttonLeftText}</AppLink>
            </Button>

            <Button asChild size="lg" variant="secondary">
              <AppLink external href={buttonRightHref}>
                {buttonRightText}
              </AppLink>
            </Button>
          </div>
        </div>
      </MarketingContainer>
    </section>
  );
}
