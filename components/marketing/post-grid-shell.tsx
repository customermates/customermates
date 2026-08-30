import type { ReactNode } from "react";

import type { Hero } from "@/core/fumadocs/schemas/common";

import { PageHero } from "@/components/marketing/page-hero";
import { MarketingSection } from "@/components/marketing/marketing-section";

type Props = {
  children: ReactNode;
  hero: Hero;
};

export function PostGridShell({ children, hero }: Props) {
  return (
    <div className="flex w-full flex-col items-center" data-marketing-flow="continuous">
      <PageHero {...hero} />

      <MarketingSection className="py-14 sm:py-18 lg:py-20" tone="canvas">
        <div className="grid auto-rows-fr grid-cols-1 gap-6 sm:grid-cols-2 md:gap-8 lg:grid-cols-3" data-hub-results="">
          {children}
        </div>
      </MarketingSection>
    </div>
  );
}
