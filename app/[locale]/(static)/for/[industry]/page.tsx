import type { Metadata } from "next";

import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import { Footer } from "@/app/components/footer";
import { AcquisitionStoryVisual } from "@/components/marketing/acquisition-story-visual";
import { LandingArticle } from "@/components/marketing/landing-article";
import { PageHero } from "@/components/marketing/page-hero";
import { PageUpdatedAt } from "@/components/marketing/page-updated-at";
import { PageEnding } from "@/components/marketing/page-ending";
import { productDemoForIndustry } from "@/components/marketing/product-demo-config";
import { ProductDemoSection } from "@/components/marketing/product-demo-section";
import { JsonLd } from "@/components/seo/json-ld";
import { generateMetadataFromMeta } from "@/core/fumadocs/metadata";
import { forPagesSource } from "@/core/fumadocs/source";
import { getMDXComponents } from "@/core/fumadocs/mdx-components";
import { breadcrumbListSchema, webPageSchema } from "@/core/seo/schemas";
import { resolvePageLastModified } from "@/core/seo/sitemap";
import { findSolutionByLandingPath } from "@/core/solutions/solution-catalog";
import { marketingLocaleOrDefault } from "@/i18n/locale-registry";
import { enableMarketingLocale } from "@/i18n/static-locale";
import { localizedSlugParams } from "@/core/fumadocs/static-params";

import { SolutionProductStage } from "../../components/solution-product-stage";

interface Props {
  params: Promise<{
    locale: string;
    industry: string;
  }>;
}

export function generateStaticParams({ params }: { params: { locale: string } }) {
  return localizedSlugParams(forPagesSource, params.locale, "industry");
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
  const { industry } = await params;
  await enableMarketingLocale(params, `/for/${industry}`);

  const [rawLocale, t] = await Promise.all([getLocale(), getTranslations("StructuredData.breadcrumb")]);
  const locale = marketingLocaleOrDefault(rawLocale);
  const page = forPagesSource.getPage([industry], locale);

  if (!page) notFound();

  const MDX = page.data.body;
  const components = getMDXComponents();
  const demo = productDemoForIndustry(industry);
  const solution = findSolutionByLandingPath(`/for/${industry}`);
  const visual =
    page.data.acquisition?.visual.kind === "brand-illustration" ? (
      <AcquisitionStoryVisual brief={page.data.acquisition.visual} locale={locale} />
    ) : undefined;

  return (
    <div className="relative flex flex-col items-center justify-center" data-marketing-flow="continuous">
      <JsonLd
        schema={[
          breadcrumbListSchema([
            { name: t("home"), path: `/${locale}` },
            { name: t("industries"), path: `/${locale}/for` },
            { name: page.data.industryName, path: `/${locale}/for/${industry}` },
          ]),
          webPageSchema({
            name: page.data.title,
            description: page.data.description ?? "",
            locale,
            path: `/${locale}/for/${industry}`,
            dateModified: resolvePageLastModified(page.data),
          }),
        ]}
      />

      <PageHero
        {...page.data.hero}
        meta={<PageUpdatedAt date={resolvePageLastModified(page.data)} locale={locale} />}
        stage={solution ? <SolutionProductStage locale={locale} solutionId={solution.id} /> : undefined}
        visual={solution ? undefined : visual}
      />

      {demo && !solution ? <ProductDemoSection {...demo} /> : null}

      <LandingArticle founderContact items={page.data.toc}>
        <MDX components={components} />
      </LandingArticle>

      <PageEnding
        cta={page.data.acquisition?.cta ?? page.data.cta}
        relatedHrefs={page.data.acquisition?.relatedHrefs ?? page.data.relatedHrefs ?? []}
      />

      <Footer />
    </div>
  );
}
