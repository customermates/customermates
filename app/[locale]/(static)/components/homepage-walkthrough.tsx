import type { Walkthrough } from "@/core/fumadocs/schemas/homepage";
import type { ContentLocale } from "@/i18n/locale-registry";

import { Check } from "lucide-react";

import { MarketingSection } from "@/components/marketing/marketing-section";

import { HomepageCaptureImage } from "./homepage-capture-image";
import { ProductPanel, ProductWindow } from "@/components/marketing/product-window";
import { HomepageStageLink } from "./homepage-stage-link";

type Props = {
  liveLabel: string;
  locale: ContentLocale;
  walkthrough: Walkthrough;
};

export function HomepageWalkthrough({ liveLabel, locale, walkthrough }: Props) {
  const { alt, badge, bullets, title, titleAccent } = walkthrough;

  return (
    <MarketingSection id="walkthrough" tone="canvas">
      <div className="marketing-grid items-center gap-y-12">
        <div className="col-span-12 lg:col-span-4">
          <p className="text-eyebrow">{badge}</p>

          <h2 className="text-display-sm mt-5 max-w-[16ch]">
            {/* eslint-disable react/jsx-newline */}
            {title} <span className="text-muted-foreground">{titleAccent}</span>
            {/* eslint-enable react/jsx-newline */}
          </h2>

          <ul className="mt-9 divide-y divide-border border-y border-border" data-homepage-rules="full-bleed">
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
          <ProductPanel className="p-5 sm:p-10 lg:p-12">
            <ProductWindow>
              <HomepageStageLink area="inbox" label={liveLabel}>
                <HomepageCaptureImage
                  alt={alt}
                  locale={locale}
                  mobileName="homepage-inbox-mobile"
                  name="homepage-thread-linkedin"
                  sizes="(min-width: 1024px) 50vw, 92vw"
                />
              </HomepageStageLink>
            </ProductWindow>
          </ProductPanel>
        </div>
      </div>
    </MarketingSection>
  );
}
