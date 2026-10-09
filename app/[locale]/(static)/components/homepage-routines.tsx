import type { HomepageRoutines as HomepageRoutinesContent } from "@/core/fumadocs/schemas/homepage";
import type { ContentLocale } from "@/i18n/locale-registry";

import { CalendarClock, ShieldCheck, Zap } from "lucide-react";

import { MarketingSection } from "@/components/marketing/marketing-section";

import { HomepageCaptureImage } from "./homepage-capture-image";
import { HomepageStageLink } from "./homepage-stage-link";

const POINT_ICONS = [CalendarClock, Zap, ShieldCheck] as const;

type Props = {
  liveLabel: string;
  locale: ContentLocale;
  routines: HomepageRoutinesContent;
};

export function HomepageRoutines({ liveLabel, locale, routines }: Props) {
  return (
    <MarketingSection id="routines" tone="canvas">
      <div className="marketing-grid items-center gap-y-10">
        <div className="col-span-12 lg:col-span-4">
          <p className="text-eyebrow">{routines.eyebrow}</p>

          <h2 className="text-display-sm mt-5">{routines.title}</h2>

          <p className="text-lede mt-5">{routines.description}</p>

          <ul className="mt-8 divide-y divide-border border-y border-border" data-homepage-rules="full-bleed">
            {routines.points.map((point, index) => {
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
          <div className="overflow-hidden rounded-card border border-border bg-card shadow-xl shadow-black/5">
            <HomepageStageLink area="routines" label={liveLabel}>
              <HomepageCaptureImage
                alt={routines.alt}
                locale={locale}
                mobileName="homepage-routines-mobile"
                name="homepage-routines"
                sizes="(min-width: 1024px) 56vw, 92vw"
              />
            </HomepageStageLink>
          </div>
        </div>
      </div>
    </MarketingSection>
  );
}
