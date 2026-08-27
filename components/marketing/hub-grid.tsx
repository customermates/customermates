import { ArrowRight } from "lucide-react";

import type { Hero } from "@/core/fumadocs/schemas/common";

import { Card, CardContent } from "@/components/ui/card";
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
      <div className="relative w-full overflow-hidden py-16 md:py-24">
        <PageHero {...hero} />
      </div>

      <section className="relative z-10 w-full max-w-7xl px-4 pb-16 md:pb-24">
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4 lg:grid-cols-3">
          {items.map((item) => (
            <li key={item.href}>
              <IntlLink className="group block h-full" href={item.href}>
                <Card className="h-full transition-shadow hover:shadow-md">
                  <CardContent className="flex flex-col gap-2 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-base font-semibold leading-snug">{item.name}</h3>

                      <ArrowRight className="mt-0.5 size-4 shrink-0 text-subdued transition-colors group-hover:text-primary" />
                    </div>

                    <p className="text-sm text-subdued line-clamp-2">{item.description}</p>
                  </CardContent>
                </Card>
              </IntlLink>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
