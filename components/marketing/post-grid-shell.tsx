import type { ReactNode } from "react";

import type { Hero } from "@/core/fumadocs/schemas/common";

import { LandingHeroView } from "@/components/marketing/landing-hero";
import { MarketingSection } from "@/components/marketing/marketing-section";

type Props = {
  children: ReactNode;
  hero: Hero;
};

export function PostGridShell({ children, hero }: Props) {
  return (
    <div className="flex w-full flex-col items-center" data-marketing-flow="continuous">
      <LandingHeroView hero={hero} />

      <MarketingSection className="mk-section-tight pt-6 sm:pt-8">
        <div className="grid auto-rows-fr grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" data-hub-results="">
          {children}
        </div>
      </MarketingSection>
    </div>
  );
}
