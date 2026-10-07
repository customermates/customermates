import type { HomepageStory } from "@/core/fumadocs/schemas/homepage";
import type { ContentLocale } from "@/i18n/locale-registry";

import { BarChart3, Columns3, MousePointer2 } from "lucide-react";

import { MarketingSection } from "@/components/marketing/marketing-section";

import { HomepageCaptureImage } from "./homepage-capture-image";

const POINT_ICONS = [Columns3, BarChart3, MousePointer2] as const;

export function HomepagePipeline({ locale, story }: { locale: ContentLocale; story: HomepageStory }) {
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

      <div className="mt-12 grid gap-5 lg:grid-cols-2">
        {story.captures.map((capture) => (
          <figure key={capture.capture} className="m-0">
            <div className="overflow-hidden rounded-card border border-border bg-card shadow-xl shadow-black/5">
              <HomepageCaptureImage
                alt={capture.alt}
                locale={locale}
                mobileName={`${capture.capture}-mobile`}
                name={capture.capture}
                sizes="(min-width: 1024px) 40vw, 92vw"
              />
            </div>

            <figcaption className="mt-4 text-sm">
              {/* eslint-disable react/jsx-newline */}
              <span className="font-medium">{capture.title}</span>{" "}
              <span className="text-muted-foreground">{capture.caption}</span>
              {/* eslint-enable react/jsx-newline */}
            </figcaption>
          </figure>
        ))}
      </div>

      <p className="text-meta mt-6 text-xs">{story.disclosure}</p>
    </MarketingSection>
  );
}
