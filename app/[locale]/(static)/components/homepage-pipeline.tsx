import type { HomepageStory } from "@/core/fumadocs/schemas/homepage";
import type { ContentLocale } from "@/i18n/locale-registry";

import { BarChart3, Columns3, MousePointer2 } from "lucide-react";

import { MarketingSection } from "@/components/marketing/marketing-section";

import { HomepageCaptureImage } from "./homepage-capture-image";
import { ProductPanel, ProductWindow } from "@/components/marketing/product-window";
import { HomepageStageLink } from "./homepage-stage-link";

const POINT_ICONS = [Columns3, BarChart3, MousePointer2] as const;

type Props = {
  liveLabel: string;
  locale: ContentLocale;
  story: HomepageStory;
};

export function HomepagePipeline({ liveLabel, locale, story }: Props) {
  return (
    <MarketingSection id="pipeline">
      <div className="marketing-grid items-end gap-y-8">
        <div className="col-span-12 lg:col-span-6">
          <p className="text-eyebrow">{story.eyebrow}</p>

          <h2 className="text-display-sm mt-5">{story.title}</h2>

          <p className="text-lede mt-5">{story.description}</p>
        </div>

        <ul
          className="col-span-12 divide-y divide-border border-y border-border lg:col-start-8 lg:col-end-13"
          data-homepage-rules="full-bleed"
        >
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

      <figure className="m-0 mt-12">
        <ProductPanel className="p-5 sm:p-10 lg:p-12">
          <ProductWindow>
            <HomepageStageLink area="pipeline" label={liveLabel}>
              <HomepageCaptureImage
                alt={story.capture.alt}
                locale={locale}
                mobileName="homepage-pipeline-mobile"
                name="homepage-pipeline-board"
                sizes="(min-width: 1280px) 76rem, 92vw"
              />
            </HomepageStageLink>
          </ProductWindow>
        </ProductPanel>

        <figcaption className="mt-4 text-sm">
          {/* eslint-disable react/jsx-newline */}
          <span className="font-medium">{story.capture.title}</span>{" "}
          <span className="text-muted-foreground">{story.capture.caption}</span>
          {/* eslint-enable react/jsx-newline */}
        </figcaption>
      </figure>
    </MarketingSection>
  );
}
