import type { Hero } from "@/core/fumadocs/schemas/homepage";

import { MarketingHero } from "@/components/marketing/marketing-hero";

type Props = {
  heroSection: Hero;
};

export function HomepageHero({ heroSection }: Props) {
  return (
    <div className="contents" data-homepage-section="hero">
      <MarketingHero
        description={heroSection.subtitle}
        footnotes={<p className="text-muted-foreground">{heroSection.assurance}</p>}
        primary={heroSection.primaryCta}
        secondary={{ ...heroSection.secondaryCta, play: true }}
        title={heroSection.title}
      />
    </div>
  );
}
