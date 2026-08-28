import type { Metadata } from "next";

import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import { Footer } from "@/app/components/footer";
import { AcquisitionPageEnding } from "@/components/marketing/acquisition-page-ending";
import { AcquisitionStoryVisual } from "@/components/marketing/acquisition-story-visual";
import { LandingArticle } from "@/components/marketing/landing-article";
import { PageHero } from "@/components/marketing/page-hero";
import { CTASection } from "@/components/marketing/cta-section";
import { JsonLd } from "@/components/seo/json-ld";
import { generateMetadataFromMeta } from "@/core/fumadocs/metadata";
import { forPagesSource } from "@/core/fumadocs/source";
import { getMDXComponents } from "@/core/fumadocs/mdx-components";
import { breadcrumbListSchema } from "@/core/seo/schemas";
import { contentLocaleOrDefault } from "@/i18n/locale-registry";

interface Props {
  params: Promise<{
    locale: string;
    industry: string;
  }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, industry } = await params;

  return generateMetadataFromMeta({
    locale,
    route: "/for/:industry",
    params: { industry },
  });
}

export default async function ForIndustryPage({ params }: Props) {
  const [rawLocale, t, { industry }] = await Promise.all([
    getLocale(),
    getTranslations("StructuredData.breadcrumb"),
    params,
  ]);
  const locale = contentLocaleOrDefault(rawLocale);
  const page = forPagesSource.getPage([industry], locale);

  if (!page) notFound();

  const MDX = page.data.body;
  const components = getMDXComponents();
  const visual =
    page.data.acquisition?.visual.kind === "brand-illustration" ? (
      <AcquisitionStoryVisual brief={page.data.acquisition.visual} locale={locale} />
    ) : undefined;

  return (
    <div className="relative flex flex-col items-center justify-center" data-marketing-flow="continuous">
      <JsonLd
        schema={breadcrumbListSchema([
          { name: t("home"), path: `/${locale}` },
          { name: t("industries"), path: `/${locale}/for` },
          { name: page.data.industryName, path: `/${locale}/for/${industry}` },
        ])}
      />

      <PageHero {...page.data.hero} visual={visual} />

      <LandingArticle founderContact={Boolean(page.data.acquisition)} items={page.data.toc}>
        <MDX components={components} />
      </LandingArticle>

      {page.data.acquisition ? (
        <AcquisitionPageEnding acquisition={page.data.acquisition} />
      ) : (
        <CTASection {...page.data.cta} />
      )}

      <Footer />
    </div>
  );
}
