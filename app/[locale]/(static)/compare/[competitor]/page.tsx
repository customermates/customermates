import type { Metadata } from "next";

import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import { WorkspaceGeneratorSection } from "../../components/workspace-generator-section";
import { LandingHero } from "@/components/marketing/landing-hero";
import { ProductFilm } from "@/components/marketing/product-film";
import { PageUpdatedAt } from "@/components/marketing/page-updated-at";
import { Footer } from "@/app/components/footer";
import { ComparisonTable } from "@/components/marketing/comparison-table";
import { LandingArticle } from "@/components/marketing/landing-article";
import { PageEnding } from "@/components/marketing/page-ending";
import { JsonLd } from "@/components/seo/json-ld";
import { generateMetadataFromMeta } from "@/core/fumadocs/metadata";
import { comparePagesSource } from "@/core/fumadocs/source";
import { comparePagesBodySource } from "@/core/fumadocs/body-sources/compare-pages";
import { getMDXComponents } from "@/core/fumadocs/mdx-components";
import { breadcrumbListSchema, webPageSchema } from "@/core/seo/schemas";
import { resolvePageLastModified } from "@/core/seo/sitemap";
import { enableStaticLocale } from "@/i18n/static-locale";
import { localizedSlugParams } from "@/core/fumadocs/static-params";

import {
  CompareReasons,
  CompareSwitchSteps,
  LandingUseCases,
  compareEyebrows,
} from "../../components/landing-sections";

interface Props {
  params: Promise<{
    locale: string;
    competitor: string;
  }>;
}

export function generateStaticParams({ params }: { params: { locale: string } }) {
  return localizedSlugParams(comparePagesSource, params.locale, "competitor");
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, competitor } = await params;

  return generateMetadataFromMeta({
    locale,
    route: "/compare/:competitor",
    params: { competitor },
  });
}

export default async function CompetitorComparePage({ params }: Props) {
  await enableStaticLocale(params);

  const locale = await getLocale();
  const t = await getTranslations("StructuredData.breadcrumb");
  const eyebrows = await compareEyebrows();
  const { competitor } = await params;
  const page = comparePagesBodySource.getPage([competitor], locale);

  if (!page) notFound();

  const MDX = page.data.body;
  const components = getMDXComponents();

  return (
    <div className="flex flex-col items-center justify-center" data-marketing-flow="continuous">
      <JsonLd
        schema={[
          breadcrumbListSchema([
            { name: t("home"), path: `/${locale}` },
            { name: t("compare"), path: `/${locale}/compare` },
            {
              name: page.data.competitorName,
              path: `/${locale}/compare/${competitor}`,
            },
          ]),
          webPageSchema({
            name: page.data.title,
            description: page.data.description ?? "",
            locale,
            path: `/${locale}/compare/${competitor}`,
            dateModified: resolvePageLastModified(page.data),
          }),
        ]}
      />

      <LandingHero
        eyebrow={eyebrows.hero}
        hero={page.data.hero}
        meta={<PageUpdatedAt date={resolvePageLastModified(page.data)} locale={locale} />}
      />

      <ProductFilm />

      <CompareReasons reasons={page.data.sections.reasons} />

      <WorkspaceGeneratorSection locale={locale} />

      <ComparisonTable
        competitor2Name={page.data.comparison.competitor2Name}
        competitorName={page.data.comparison.competitorName}
        eyebrow={eyebrows.table}
        sections={page.data.comparison.sections}
        title={page.data.comparison.title}
      />

      {page.data.sections.switchSteps ? <CompareSwitchSteps /> : null}

      <LandingUseCases locale={locale} override={page.data.sections.useCases} path={`/compare/${competitor}`} />

      <LandingArticle founderContact items={page.data.toc}>
        <MDX components={components} />
      </LandingArticle>

      <PageEnding cta={page.data.cta} relatedHrefs={page.data.relatedHrefs} />

      <Footer />
    </div>
  );
}
