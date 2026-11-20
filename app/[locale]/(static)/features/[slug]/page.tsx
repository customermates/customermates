import { WorkspaceGeneratorSection } from "../../components/workspace-generator-section";
import type { Metadata } from "next";
import type { FeatureSections } from "@/core/fumadocs/schemas/landing-sections";

import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import { Footer } from "@/app/components/footer";
import { LandingArticle } from "@/components/marketing/landing-article";
import { LandingHero } from "@/components/marketing/landing-hero";
import { PageUpdatedAt } from "@/components/marketing/page-updated-at";
import { PageEnding } from "@/components/marketing/page-ending";
import { TemplateProofBlock } from "@/components/marketing/templates/template-proof-block";
import { JsonLd } from "@/components/seo/json-ld";
import { generateMetadataFromMeta } from "@/core/fumadocs/metadata";
import { featurePagesSource } from "@/core/fumadocs/source";
import { featurePagesBodySource } from "@/core/fumadocs/body-sources/feature-pages";
import { getMDXComponents } from "@/core/fumadocs/mdx-components";
import { breadcrumbListSchema, webPageSchema } from "@/core/seo/schemas";
import { resolvePageLastModified } from "@/core/seo/sitemap";
import { SOLUTION_CATALOG, findSolutionByLandingPath } from "@/core/solutions/solution-catalog";
import { marketingLocaleOrDefault } from "@/i18n/locale-registry";
import { enableMarketingLocale } from "@/i18n/static-locale";
import { localizedSlugParams } from "@/core/fumadocs/static-params";

import { FeatureSteps, LandingHighlights, LandingUseCases, LandingVisual } from "../../components/landing-sections";
import { SolutionLanding } from "../../components/solution-landing";

const DEFAULT_SECTIONS: FeatureSections = { visual: { kind: "film" } };

interface Props {
  params: Promise<{
    locale: string;
    slug: string;
  }>;
}

export function generateStaticParams({ params }: { params: { locale: string } }) {
  return localizedSlugParams(featurePagesSource, params.locale, "slug");
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;

  return generateMetadataFromMeta({
    locale,
    route: "/features/:slug",
    params: { slug },
  });
}

export default async function FeaturePage({ params }: Props) {
  const { slug } = await params;
  await enableMarketingLocale(params, `/features/${slug}`);

  const [rawLocale, t] = await Promise.all([getLocale(), getTranslations("StructuredData.breadcrumb")]);
  const locale = marketingLocaleOrDefault(rawLocale);
  const page = featurePagesBodySource.getPage([slug], locale);

  if (!page) notFound();

  const MDX = page.data.body;
  const components = getMDXComponents();
  const solution = findSolutionByLandingPath(`/features/${slug}`);
  const landingSolution = SOLUTION_CATALOG.find((entry) => entry.id === page.data.landing?.solution) ?? solution;
  const sections = page.data.sections ?? DEFAULT_SECTIONS;
  const updatedAt = <PageUpdatedAt date={resolvePageLastModified(page.data)} locale={locale} />;

  return (
    <div className="relative flex flex-col items-center justify-center" data-marketing-flow="continuous">
      <JsonLd
        schema={[
          breadcrumbListSchema([
            { name: t("home"), path: `/${locale}` },
            { name: t("features"), path: `/${locale}/features` },
            {
              name: page.data.featureName,
              path: `/${locale}/features/${slug}`,
            },
          ]),
          webPageSchema({
            name: page.data.title,
            description: page.data.description ?? "",
            locale,
            path: `/${locale}/features/${slug}`,
            dateModified: resolvePageLastModified(page.data),
          }),
        ]}
      />

      {page.data.landing && landingSolution ? (
        <SolutionLanding landing={page.data.landing} locale={locale} solutionId={landingSolution.id} />
      ) : (
        <>
          <LandingHero eyebrow={page.data.featureName} hero={page.data.hero} meta={updatedAt} />

          <LandingVisual locale={locale} name={page.data.featureName} visual={sections.visual} />

          {sections.visual.kind === "stage" ? null : <WorkspaceGeneratorSection locale={locale} />}

          <LandingUseCases locale={locale} override={sections.useCases} path={`/features/${slug}`} />

          {sections.steps ? <FeatureSteps name={page.data.featureName} steps={sections.steps} /> : null}

          {sections.highlights ? (
            <LandingHighlights highlights={sections.highlights} locale={locale} name={page.data.featureName} />
          ) : null}
        </>
      )}

      <LandingArticle founderContact items={page.data.toc}>
        <MDX components={components} />
      </LandingArticle>

      <TemplateProofBlock locale={locale} path={`/features/${slug}`} />

      <PageEnding
        cta={page.data.acquisition?.cta ?? page.data.cta}
        relatedHrefs={page.data.acquisition?.relatedHrefs ?? page.data.relatedHrefs ?? []}
      />

      <Footer />
    </div>
  );
}
