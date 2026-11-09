import type { Metadata } from "next";

import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import { Footer } from "@/app/components/footer";
import { LandingArticle } from "@/components/marketing/landing-article";
import { LandingHero } from "@/components/marketing/landing-hero";
import { PageUpdatedAt } from "@/components/marketing/page-updated-at";
import { PageEnding } from "@/components/marketing/page-ending";
import { ProductFilm } from "@/components/marketing/product-film";
import { UseCasesSection } from "@/components/marketing/use-cases-section";
import { productDemoForIndustry } from "@/components/marketing/product-demo-config";
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

import { SolutionLanding } from "../../components/solution-landing";
import { SolutionStageSection } from "../../components/solution-stage-section";

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
  const solution = findSolutionByLandingPath(`/for/${industry}`);
  const stageSolutionId = solution?.id ?? productDemoForIndustry(industry)?.solutionId;

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

      {page.data.landing && solution ? (
        <SolutionLanding
          landing={page.data.landing}
          locale={locale}
          solutionId={solution.id}
          useCases={page.data.useCases}
        />
      ) : (
        <>
          <LandingHero
            eyebrow={page.data.industryName}
            hero={page.data.hero}
            meta={<PageUpdatedAt date={resolvePageLastModified(page.data)} locale={locale} />}
          />

          <ProductFilm />

          {page.data.useCases ? <UseCasesSection useCases={page.data.useCases} /> : null}

          {stageSolutionId ? <SolutionStageSection locale={locale} solutionId={stageSolutionId} /> : null}
        </>
      )}

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
