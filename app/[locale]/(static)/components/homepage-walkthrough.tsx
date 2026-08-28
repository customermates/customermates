import type { HomepageVisualLabels, Walkthrough } from "@/core/fumadocs/schemas/homepage";
import type { ContentLocale } from "@/i18n/locale-registry";

import { Check } from "lucide-react";

import { MarketingSection } from "@/components/marketing/marketing-section";

import { HomepageOmnichannelVisual } from "./homepage-story-visuals";

type Props = {
  locale: ContentLocale;
  visualLabels: HomepageVisualLabels;
  walkthrough: Walkthrough;
};

export function HomepageWalkthrough({ locale, visualLabels, walkthrough }: Props) {
  const { badge, bullets, title, titleAccent, visualLabel } = walkthrough;

  return (
    <MarketingSection id="walkthrough" tone="canvas">
      <div className="marketing-grid items-center gap-y-10">
        <div className="col-span-12 lg:col-span-4">
          <p className="text-eyebrow">{badge}</p>

          <h2 className="text-display-sm mt-5 max-w-[14ch]">
            {/* eslint-disable react/jsx-newline */}
            {title} <span>{titleAccent}</span>
            {/* eslint-enable react/jsx-newline */}
          </h2>

          <ul className="mt-9 divide-y divide-border border-y border-border">
            {bullets.slice(0, 3).map((bullet) => (
              <li key={bullet.title} className="grid grid-cols-[auto_1fr] gap-3 py-4">
                <span className="mt-0.5 grid size-6 place-items-center rounded-full bg-primary/15 text-primary">
                  <Check aria-hidden className="size-3.5" strokeWidth={2.5} />
                </span>

                <div>
                  <h3 className="text-sm font-medium">{bullet.title}</h3>

                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{bullet.description}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="col-span-12 lg:col-start-6 lg:col-end-13">
          <HomepageOmnichannelVisual label={visualLabel} labels={visualLabels} locale={locale} />
        </div>
      </div>
    </MarketingSection>
  );
}
