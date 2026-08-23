import { ArrowRight } from "lucide-react";

import type { Hero } from "@/core/fumadocs/schemas/common";

import { MarketingContainer } from "@/components/marketing/marketing-container";
import { PageHero } from "@/components/marketing/page-hero";
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
    <div className="flex w-full flex-col items-center">
      <div className="w-full pt-16 md:pt-24">
        <PageHero {...hero} />
      </div>

      <section className="w-full pb-16 md:pb-24">
        <MarketingContainer>
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <li key={item.href}>
                <IntlLink className="group block h-full" href={item.href}>
                  <article className="marketing-transition flex h-full flex-col gap-2 rounded-card border border-border bg-card p-6 group-hover:border-border-strong">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-medium leading-snug">{item.name}</h3>

                      <ArrowRight className="marketing-transition mt-0.5 size-4 shrink-0 text-muted-foreground group-hover:text-foreground" />
                    </div>

                    <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">{item.description}</p>
                  </article>
                </IntlLink>
              </li>
            ))}
          </ul>
        </MarketingContainer>
      </section>
    </div>
  );
}
