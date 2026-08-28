import type { ContentLocale } from "@/i18n/locale-registry";
import type { HomepageStory, HomepageVisualLabels } from "@/core/fumadocs/schemas/homepage";

import { BarChart3, Columns3, MousePointer2 } from "lucide-react";

import { MarketingSection } from "@/components/marketing/marketing-section";

import { HomepagePipelineVisual } from "./homepage-story-visuals";

const POINT_ICONS = [Columns3, BarChart3, MousePointer2] as const;

export function HomepagePipeline({
  locale,
  story,
  visualLabels,
}: {
  locale: ContentLocale;
  story: HomepageStory;
  visualLabels: HomepageVisualLabels;
}) {
  return (
    <MarketingSection id="pipeline">
      <div className="marketing-grid items-center gap-y-10">
        <div className="col-span-12 lg:col-span-4">
          <p className="text-eyebrow">{story.eyebrow}</p>

          <h2 className="text-display-sm mt-5">{story.title}</h2>

          <p className="text-lede mt-5">{story.description}</p>

          <ul className="mt-8 divide-y divide-border border-y border-border">
            {story.points.map((point, index) => {
              const Icon = POINT_ICONS[index];
              return (
                <li key={point} className="flex items-center gap-3 py-4 text-sm">
                  <Icon aria-hidden className="size-4 text-muted-foreground" strokeWidth={1.75} />

                  {point}
                </li>
              );
            })}
          </ul>
        </div>

        <div className="col-span-12 lg:col-start-6 lg:col-end-13">
          <HomepagePipelineVisual labels={visualLabels} locale={locale} />
        </div>
      </div>
    </MarketingSection>
  );
}
