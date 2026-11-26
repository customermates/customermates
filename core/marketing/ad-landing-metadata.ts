import type { Metadata } from "next";

import { resolveCommercialTokensDeep } from "@/core/commercial/commercial-tokens";
import { buildPageMetadata } from "@/core/seo/page-metadata";

import { AD_LANDING_LOCALE, AD_LANDING_PAGES, AD_LANDING_ROUTE, type AdLandingSlug } from "./ad-landing-pages";

export function adLandingMetadata(slug: AdLandingSlug): Metadata {
  const page = resolveCommercialTokensDeep(AD_LANDING_PAGES[slug], AD_LANDING_LOCALE);

  return buildPageMetadata({
    description: page.description,
    locale: AD_LANDING_LOCALE,
    noindex: true,
    publicPath: `${AD_LANDING_ROUTE}/${slug}`,
    title: page.title,
  });
}
