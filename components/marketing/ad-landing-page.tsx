import type { SolutionStageTab } from "@/app/[locale]/(static)/components/solution-stage-tab";

import { ArrowRight, Check } from "lucide-react";

import { SolutionStageImage } from "@/app/[locale]/(static)/components/solution-stage-image";
import { resolveCommercialTokens, resolveCommercialTokensDeep } from "@/core/commercial/commercial-tokens";
import {
  AD_LANDING_AUDIENCE,
  AD_LANDING_CTA,
  AD_LANDING_FAQ_TITLE,
  AD_LANDING_PAGES,
  AD_LANDING_PRICE_LINE,
  AD_LANDING_PRODUCT_CAPTION,
  AD_LANDING_SIGNUP_HREF,
  type AdLandingSlug,
} from "@/core/marketing/ad-landing-pages";
import solutionCaptureManifest from "@/core/solutions/solution-capture-manifest.json";
import { type SolutionCaptureManifest, solutionCapturePair } from "@/core/solutions/solution-captures";

import { FAQSection } from "./faq-section";
import { marketingButtonClassName } from "./marketing-button";
import { MarketingSection } from "./marketing-section";
import { ProductWindow } from "./product-window";

const PRODUCT_VIEW_SOLUTION = "smb";

type Props = {
  locale: string;
  slug: AdLandingSlug;
};

export function AdLandingPageView({ locale, slug }: Props) {
  const page = resolveCommercialTokensDeep(AD_LANDING_PAGES[slug], locale);
  const pair = solutionCapturePair(solutionCaptureManifest as SolutionCaptureManifest, PRODUCT_VIEW_SOLUTION, locale);
  const poster: SolutionStageTab["poster"] | null = pair ? { dark: pair.dark.main, light: pair.light.main } : null;

  return (
    <>
      <MarketingSection className="pt-12 pb-10 sm:pt-16 sm:pb-14">
        <div className="grid items-center gap-10 lg:grid-cols-[1fr_1.15fr] lg:gap-14">
          <div className="min-w-0">
            <h1 className="mk-display text-balance">{page.h1}</h1>

            <p className="mk-lede mt-5">{AD_LANDING_AUDIENCE}</p>

            <ul className="mt-7 grid gap-3" data-ad-landing-points="">
              {page.points.map((point) => (
                <li key={point} className="flex items-start gap-2.5 text-[0.9375rem] leading-6 text-foreground">
                  <Check aria-hidden className="mt-1 size-4 shrink-0" />

                  {point}
                </li>
              ))}
            </ul>

            <p className="mt-7 text-sm leading-6 text-muted-foreground" data-ad-landing-price="">
              {resolveCommercialTokens(AD_LANDING_PRICE_LINE, locale)}
            </p>

            <a
              className={`${marketingButtonClassName({ size: "lg" })} mt-6`}
              data-ad-landing-signup=""
              href={AD_LANDING_SIGNUP_HREF}
            >
              {resolveCommercialTokens(AD_LANDING_CTA, locale)}

              <ArrowRight aria-hidden data-mk-arrow="" />
            </a>
          </div>

          {poster ? (
            <figure className="min-w-0">
              <ProductWindow>
                <SolutionStageImage
                  eager
                  alt={AD_LANDING_PRODUCT_CAPTION}
                  name="ad-landing"
                  poster={poster}
                  sizes="(min-width: 1024px) 40rem, 92vw"
                />
              </ProductWindow>

              <figcaption className="mt-3 text-center text-xs text-muted-foreground">
                {AD_LANDING_PRODUCT_CAPTION}
              </figcaption>
            </figure>
          ) : null}
        </div>
      </MarketingSection>

      <FAQSection
        faqs={page.faq.map((item, index) => ({ content: item.answer, id: `faq-${index}`, title: item.question }))}
        title={AD_LANDING_FAQ_TITLE}
      />
    </>
  );
}
