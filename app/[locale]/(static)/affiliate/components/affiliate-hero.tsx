import type { Hero } from "@/core/fumadocs/schemas/affiliate";

import { Button } from "@/components/ui/button";
import { MarketingContainer } from "@/components/marketing/marketing-container";

import { AppLink } from "@/components/shared/app-link";

type Props = {
  heroSection: Hero;
};

export function AffiliateHero({ heroSection }: Props) {
  return (
    <section className="w-full pt-16 pb-12 sm:pb-16 md:pt-24">
      <MarketingContainer>
        <div className="flex flex-col items-center text-center">
          <h1 className="text-display m-0 max-w-5xl">{heroSection.title}</h1>

          <p className="text-lede mt-6">{heroSection.description}</p>

          <div className="mt-9 flex w-full flex-col items-stretch justify-center gap-3 sm:w-auto sm:flex-row sm:items-center">
            <Button asChild size="lg">
              <AppLink href={heroSection.buttonLeftHref}>{heroSection.buttonLeftText}</AppLink>
            </Button>

            <Button asChild size="lg" variant="secondary">
              <AppLink external href={heroSection.buttonRightHref}>
                {heroSection.buttonRightText}
              </AppLink>
            </Button>
          </div>

          <p className="text-meta mt-6">{heroSection.hint}</p>
        </div>
      </MarketingContainer>
    </section>
  );
}
