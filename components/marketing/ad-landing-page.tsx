import { ArrowRight, Check } from "lucide-react";
import { getImageProps } from "next/image";

import {
  HOMEPAGE_CAPTURES,
  type HomepageCaptureName,
  homepageCaptureSrc,
} from "@/app/[locale]/(static)/components/homepage-captures";
import { resolveCommercialTokens, resolveCommercialTokensDeep } from "@/core/commercial/commercial-tokens";
import {
  AD_LANDING_AUDIENCE,
  AD_LANDING_CTA,
  AD_LANDING_CTA_DESCRIPTION,
  AD_LANDING_CTA_HINT,
  AD_LANDING_DEMO_HREF,
  AD_LANDING_DEMO_LABEL,
  AD_LANDING_FAQ_TITLE,
  AD_LANDING_LOCALE,
  AD_LANDING_PAGES,
  AD_LANDING_PLANS,
  AD_LANDING_PRICE_UNIT,
  AD_LANDING_PRODUCT_CAPTION,
  AD_LANDING_SELF_HOST_HREF,
  AD_LANDING_SELF_HOST_LABEL,
  AD_LANDING_SIGNUP_HREF,
  type AdLandingCapture,
  type AdLandingSlug,
} from "@/core/marketing/ad-landing-pages";
import { cn } from "@/core/utils/cn";

import { FAQSection } from "./faq-section";
import { marketingButtonClassName } from "./marketing-button";
import { MarketingSection } from "./marketing-section";
import { ProductWindow } from "./product-window";

const PHONE_CAPTURES = {
  "homepage-dashboard": "homepage-dashboard-mobile",
  "homepage-inbox": "homepage-inbox-mobile",
  "homepage-pipeline": "homepage-pipeline-mobile",
  "homepage-record": "homepage-record-mobile",
} as const satisfies Record<AdLandingCapture, HomepageCaptureName>;

const THEMES = [
  { className: "dark:hidden", theme: "light" },
  { className: "not-dark:hidden", theme: "dark" },
] as const;

const DESKTOP_MEDIA = "(min-width: 40rem)";

function captureImage(name: HomepageCaptureName, theme: "dark" | "light", alt: string, sizes: string) {
  const size = HOMEPAGE_CAPTURES[name][AD_LANDING_LOCALE];
  return getImageProps({
    alt,
    height: size.height,
    sizes,
    src: homepageCaptureSrc(name, AD_LANDING_LOCALE, theme),
    width: size.width,
  }).props;
}

function LandingCapture({ alt, capture, slug }: { alt: string; capture: AdLandingCapture; slug: AdLandingSlug }) {
  return THEMES.map(({ className, theme }) => {
    const desktop = captureImage(capture, theme, alt, "(min-width: 1024px) 40rem, 92vw");
    const phone = captureImage(PHONE_CAPTURES[capture], theme, alt, "20rem");

    return (
      <picture key={theme} className={cn("block", className)}>
        <source
          height={desktop.height}
          media={DESKTOP_MEDIA}
          sizes={desktop.sizes}
          srcSet={desktop.srcSet}
          width={desktop.width}
        />

        {/* eslint-disable-next-line @next/next/no-img-element -- getImageProps keeps next/image optimization */}
        <img
          {...phone}
          alt={alt}
          className="block h-auto w-full max-sm:max-h-[26rem] max-sm:object-cover max-sm:object-top"
          data-ad-landing-capture={`${slug}:${capture}`}
          decoding="async"
          fetchPriority="high"
          loading="eager"
        />
      </picture>
    );
  });
}

function SignupButton({ label, position }: { label: string; position: "hero" | "footer" }) {
  return (
    <a
      className={cn(marketingButtonClassName({ size: "lg" }), "w-full justify-center sm:w-auto")}
      data-ad-landing-signup={position}
      href={AD_LANDING_SIGNUP_HREF}
    >
      {label}

      <ArrowRight aria-hidden data-mk-arrow="" />
    </a>
  );
}

function PriceStrip({ locale }: { locale: string }) {
  const plans = resolveCommercialTokensDeep(AD_LANDING_PLANS, locale);

  return (
    <div className="mt-7" data-ad-landing-price="">
      <dl className="grid grid-cols-3 gap-2">
        {plans.map((plan) => (
          <div
            key={plan.name}
            className={cn(
              "rounded-xl border px-3 py-2.5",
              "highlight" in plan && plan.highlight
                ? "border-foreground/30 bg-foreground/[0.04]"
                : "border-foreground/10",
            )}
            data-ad-landing-plan={plan.name}
          >
            <dt className="text-xs font-medium text-muted-foreground">{plan.name}</dt>

            <dd className="mt-0.5 text-xl font-semibold tracking-tight text-foreground tabular-nums">{plan.price}</dd>

            <dd className="mt-1 text-[0.6875rem] leading-4 text-muted-foreground">{plan.note}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-2 text-xs text-muted-foreground">{AD_LANDING_PRICE_UNIT}</p>
    </div>
  );
}

type Props = {
  locale: string;
  slug: AdLandingSlug;
};

export function AdLandingPageView({ locale, slug }: Props) {
  const page = resolveCommercialTokensDeep(AD_LANDING_PAGES[slug], locale);
  const cta = resolveCommercialTokens(AD_LANDING_CTA, locale);

  return (
    <>
      <MarketingSection className="pt-8 pb-12 sm:pt-14 sm:pb-16">
        <div className="grid items-center gap-10 lg:grid-cols-[1fr_1.15fr] lg:gap-14">
          <div className="min-w-0">
            <p className="mk-eyebrow" data-ad-landing-audience="">
              {AD_LANDING_AUDIENCE}
            </p>

            <h1 className="mk-display mt-3 text-balance">{page.h1}</h1>

            <p className="mk-lede mt-4">{page.lede}</p>

            <PriceStrip locale={locale} />

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
              <SignupButton label={cta} position="hero" />
            </div>

            <p className="mt-3 text-xs text-muted-foreground">{AD_LANDING_CTA_HINT}</p>

            <p className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <a
                className="font-medium text-foreground underline decoration-foreground/30 underline-offset-4 hover:decoration-foreground"
                data-ad-landing-demo="hero"
                href={AD_LANDING_DEMO_HREF}
                rel="nofollow noopener noreferrer"
                target="_blank"
              >
                {AD_LANDING_DEMO_LABEL}
              </a>

              <a
                className="text-muted-foreground underline decoration-foreground/20 underline-offset-4 hover:text-foreground"
                data-ad-landing-self-host=""
                href={AD_LANDING_SELF_HOST_HREF}
              >
                {AD_LANDING_SELF_HOST_LABEL}
              </a>
            </p>
          </div>

          <figure className="min-w-0">
            <ProductWindow className="mx-auto max-sm:max-w-[22rem]">
              <LandingCapture alt={page.captureAlt} capture={page.capture} slug={slug} />
            </ProductWindow>

            <figcaption className="mt-3 text-center text-xs text-muted-foreground">
              {AD_LANDING_PRODUCT_CAPTION}
            </figcaption>
          </figure>
        </div>
      </MarketingSection>

      <MarketingSection className="mk-section" title={page.proofTitle}>
        <ul className="mx-auto mt-10 grid max-w-[60rem] gap-3 sm:grid-cols-2 sm:gap-4" data-ad-landing-proof="">
          {page.proof.map((item) => (
            <li key={item.title} className="mk-card flex gap-3 p-5">
              <Check aria-hidden className="mt-1 size-4 shrink-0 text-foreground" />

              <div className="min-w-0">
                <h3 className="text-base font-semibold text-foreground">{item.title}</h3>

                <p className="mt-1.5 text-[0.9375rem] leading-6 text-muted-foreground">{item.text}</p>
              </div>
            </li>
          ))}
        </ul>
      </MarketingSection>

      <FAQSection
        faqs={page.faq.map((item, index) => ({ content: item.answer, id: `faq-${index}`, title: item.question }))}
        title={AD_LANDING_FAQ_TITLE}
      />

      <MarketingSection className="relative isolate overflow-hidden border-b-0">
        <div
          className="mk-card-raised relative mx-auto max-w-[48rem] px-6 py-12 text-center sm:px-12 sm:py-16"
          data-ad-landing-cta=""
        >
          <h2 className="mk-display mx-auto max-w-[36rem] text-balance">{page.ctaTitle}</h2>

          <p className="mk-lede mx-auto mt-4">{AD_LANDING_CTA_DESCRIPTION}</p>

          <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
            <SignupButton label={cta} position="footer" />

            <a
              className={cn(marketingButtonClassName({ size: "lg", variant: "secondary" }), "justify-center")}
              data-ad-landing-demo="footer"
              href={AD_LANDING_DEMO_HREF}
              rel="nofollow noopener noreferrer"
              target="_blank"
            >
              {AD_LANDING_DEMO_LABEL}
            </a>
          </div>

          <p className="mk-caption mt-5">{AD_LANDING_CTA_HINT}</p>
        </div>
      </MarketingSection>
    </>
  );
}
