import type { HomepageRoutines as HomepageRoutinesContent } from "@/core/fumadocs/schemas/homepage";
import type { ContentLocale } from "@/i18n/locale-registry";

import { CalendarClock, ShieldCheck, Zap } from "lucide-react";

import { MarketingSection } from "@/components/marketing/marketing-section";

import { HomepageCaptureImage } from "./homepage-capture-image";
import { ProductPanel, ProductWindow } from "./homepage-product-window";
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
          <ProductPanel className="h-[30rem] sm:h-[32rem] lg:h-[36rem]">
            <ProductWindow
              chromeClassName="max-sm:hidden"
              className="absolute top-8 left-8 w-[calc(100%-4rem)] sm:top-10 sm:left-10 sm:w-[140%] lg:top-14 lg:left-14"
              label={routines.eyebrow}
            >
              <HomepageStageLink area="routines" label={liveLabel}>
                <HomepageCaptureImage
                  alt={routines.alt}
                  locale={locale}
                  mobileName="homepage-routines-mobile"
                  name="homepage-routines"
                  sizes="(min-width: 1024px) 70vw, 92vw"
                />
              </HomepageStageLink>
            </ProductWindow>
          </ProductPanel>
        </div>
      </div>
    </MarketingSection>
  );
}
