import type { Walkthrough } from "@/core/fumadocs/schemas/homepage";
import type { ContentLocale } from "@/i18n/locale-registry";

import { Check } from "lucide-react";

import { MarketingSection } from "@/components/marketing/marketing-section";

import { HomepageCaptureImage } from "./homepage-capture-image";
import { PhoneFrame, ProductPanel, ProductWindow } from "./homepage-product-window";
import { HomepageStageLink } from "./homepage-stage-link";

type Props = {
  liveLabel: string;
  locale: ContentLocale;
  walkthrough: Walkthrough;
};

export function HomepageWalkthrough({ liveLabel, locale, walkthrough }: Props) {
  const { badge, bullets, desktopAlt, phoneAlt, title, titleAccent } = walkthrough;

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
          <ProductPanel className="h-[30rem] sm:h-[34rem] lg:h-[38rem]">
            <ProductWindow className="absolute top-10 left-10 w-[72%] max-sm:hidden lg:top-14 lg:left-14">
              <HomepageStageLink area="inbox" label={liveLabel}>
                <div className="overflow-hidden">
                  <HomepageCaptureImage
                    alt={desktopAlt}
                    className="-mt-[1%] w-[101%] max-w-none"
                    locale={locale}
                    name="homepage-thread-linkedin"
                    sizes="(min-width: 1024px) 44vw, 70vw"
                  />
                </div>
              </HomepageStageLink>
            </ProductWindow>

            <PhoneFrame className="absolute top-8 left-1/2 w-[15rem] -translate-x-1/2 sm:top-auto sm:right-8 sm:-bottom-28 sm:left-auto sm:w-[13rem] sm:translate-x-0 lg:right-10 lg:w-[13.5rem]">
              <HomepageStageLink area="inbox" label={liveLabel}>
                <HomepageCaptureImage
                  alt={phoneAlt}
                  locale={locale}
                  name="homepage-inbox-mobile"
                  sizes="(min-width: 640px) 15rem, 16rem"
                />
              </HomepageStageLink>
            </PhoneFrame>
          </ProductPanel>
        </div>
      </div>
    </MarketingSection>
  );
}
