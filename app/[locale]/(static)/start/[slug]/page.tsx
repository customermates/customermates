import type { Metadata } from "next";

import { notFound } from "next/navigation";

import { Footer } from "@/app/components/footer";
import { AdLandingPageView } from "@/components/marketing/ad-landing-page";
import { resolveCommercialTokensDeep } from "@/core/commercial/commercial-tokens";
import {
  AD_LANDING_LOCALE,
  AD_LANDING_PAGES,
  AD_LANDING_ROUTE,
  AD_LANDING_SLUGS,
  isAdLandingSlug,
} from "@/core/marketing/ad-landing-pages";
import { buildPageMetadata } from "@/core/seo/page-metadata";
import { enableMarketingLocale } from "@/i18n/static-locale";

type Props = {
  params: Promise<{ locale: string; slug: string }>;
};

export const dynamicParams = false;

export function generateStaticParams({ params }: { params: { locale: string } }) {
  return params.locale === AD_LANDING_LOCALE ? AD_LANDING_SLUGS.map((slug) => ({ slug })) : [];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  if (locale !== AD_LANDING_LOCALE || !isAdLandingSlug(slug)) return {};
  const page = resolveCommercialTokensDeep(AD_LANDING_PAGES[slug], locale);

  return buildPageMetadata({
    description: page.description,
    locale,
    noindex: true,
    publicPath: `${AD_LANDING_ROUTE}/${slug}`,
    title: page.title,
  });
}

export default async function AdLandingPage({ params }: Props) {
  const { slug } = await params;
  const locale = await enableMarketingLocale(params, `${AD_LANDING_ROUTE}/${slug}`);
  if (locale !== AD_LANDING_LOCALE || !isAdLandingSlug(slug)) notFound();

  return (
    <div className="relative flex flex-col items-center" data-ad-landing={slug} data-marketing-flow="continuous">
      <AdLandingPageView locale={locale} slug={slug} />

      <Footer />
    </div>
  );
}
