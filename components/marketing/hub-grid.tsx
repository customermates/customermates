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

export type HubGridGroup = {
  id: string;
  items: HubGridItem[];
  title: string;
};

type Props = {
  groups?: HubGridGroup[];
  hero: Hero;
  items: HubGridItem[];
  resultsTitle?: string;
};

function HubGridCards({ heading: Heading, items }: { heading: "h2" | "h3"; items: HubGridItem[] }) {
  return items.map((item) => (
    <li key={item.href} className="border-t border-border">
      <IntlLink className="group flex h-full min-h-40 flex-col py-6 text-foreground" href={item.href}>
        <div className="flex items-start justify-between gap-3">
          <Heading className="text-lg font-semibold leading-snug text-balance">{item.name}</Heading>

          <ArrowRight className="mt-1 size-4 shrink-0 text-subdued transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
        </div>

        <p className="mt-3 line-clamp-3 text-sm leading-6 text-subdued">{item.description}</p>
      </IntlLink>
    </li>
  ));
}

export function HubGrid({ groups = [], hero, items, resultsTitle }: Props) {
  const visibleGroups = groups.filter((group) => group.items.length > 0);
  const cardHeading = visibleGroups.length > 0 || resultsTitle ? "h3" : "h2";

  return (
    <div className="flex w-full flex-col items-center" data-marketing-flow="continuous">
      <PageHero {...hero} />

      <MarketingSection className="py-14 sm:py-18 lg:py-20" tone="canvas">
        {visibleGroups.map((group) => (
          <section key={group.id} aria-labelledby={`hub-group-${group.id}`} className="mb-14" data-hub-group={group.id}>
            <h2 className="mb-2 text-sm font-medium text-subdued" id={`hub-group-${group.id}`}>
              {group.title}
            </h2>

            <ul className="grid grid-cols-1 gap-x-8 md:grid-cols-2 lg:grid-cols-3">
              <HubGridCards heading={cardHeading} items={group.items} />
            </ul>
          </section>
        ))}

        {resultsTitle ? <h2 className="mb-2 text-sm font-medium text-subdued">{resultsTitle}</h2> : null}

        <ul className="grid grid-cols-1 gap-x-8 md:grid-cols-2 lg:grid-cols-3" data-hub-results="">
          <HubGridCards heading={cardHeading} items={items} />
        </ul>
      </MarketingSection>
    </div>
  );
}
