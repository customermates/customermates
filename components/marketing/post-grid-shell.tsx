import type { ReactNode } from "react";

import type { Hero } from "@/core/fumadocs/schemas/common";

import { MarketingContainer } from "@/components/marketing/marketing-container";
import { PageHero } from "@/components/marketing/page-hero";

type Props = {
  children: ReactNode;
  hero: Hero;
};

export function PostGridShell({ children, hero }: Props) {
  return (
    <div className="flex w-full flex-col items-center pt-16 md:pt-24">
      <PageHero {...hero} />

      <section className="w-full pb-16 md:pb-24" data-hub-results="">
        <MarketingContainer>
          <div className="grid auto-rows-fr grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
        </MarketingContainer>
      </section>
    </div>
  );
}
