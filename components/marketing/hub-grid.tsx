import { ArrowRight } from "lucide-react";

import type { Hero } from "@/core/fumadocs/schemas/common";

import { PageHero } from "@/components/marketing/page-hero";
import { MarketingSection } from "@/components/marketing/marketing-section";
import { IntlLink } from "@/i18n/navigation";

export type HubGridItem = {
  description: string;
  href: string;
  name: string;
};

type Props = {
  hero: Hero;
  items: HubGridItem[];
};

export function HubGrid({ hero, items }: Props) {
  return (
    <div className="flex w-full flex-col items-center" data-marketing-flow="continuous">
      <PageHero {...hero} />

      <MarketingSection className="py-14 sm:py-18 lg:py-20" tone="canvas">
        <ul className="grid grid-cols-1 gap-x-8 md:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <li key={item.href} className="border-t border-border">
              <IntlLink className="group flex h-full min-h-40 flex-col py-6 text-foreground" href={item.href}>
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-lg font-semibold leading-snug text-balance">{item.name}</h3>

                  <ArrowRight className="mt-1 size-4 shrink-0 text-subdued transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                </div>

                <p className="mt-3 line-clamp-3 text-sm leading-6 text-subdued">{item.description}</p>
              </IntlLink>
            </li>
          ))}
        </ul>
      </MarketingSection>
    </div>
  );
}
