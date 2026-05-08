import type { Metadata } from "next";

import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";

import { PageHero } from "@/components/marketing/page-hero";
import { Footer } from "@/app/components/footer";
import { ComparisonTable } from "@/components/marketing/comparison-table";
import { ShowcaseFrame } from "@/components/marketing/showcase-frame";
import { AppImage } from "@/components/shared/app-image";
import { JsonLd } from "@/components/seo/json-ld";
import { generateMetadataFromMeta } from "@/core/fumadocs/metadata";
import { comparePagesSource } from "@/core/fumadocs/source";
import { getMDXComponents } from "@/core/fumadocs/mdx-components";
import { CTASection } from "@/components/marketing/cta-section";
import { Toc } from "@/components/shared/toc";
import { breadcrumbListSchema } from "@/core/seo/schemas";

interface Props {
  params: Promise<{
    locale: string;
    competitor: string;
  }>;
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
  const locale = await getLocale();
  const { competitor } = await params;
  const page = comparePagesSource.getPage([competitor], locale);

  if (!page) notFound();

  const MDX = page.data.body;
  const components = getMDXComponents();

  return (
    <div className="flex flex-col items-center justify-center pt-16 md:pt-24">
      <JsonLd
        schema={breadcrumbListSchema([
          { name: "Home", path: `/${locale}` },
          { name: "Compare", path: `/${locale}/compare` },
          { name: page.data.competitorName, path: `/${locale}/compare/${competitor}` },
        ])}
      />

      <PageHero {...page.data.hero} />

      <div className="relative w-full max-w-6xl mx-auto px-4 mb-8">
        <ShowcaseFrame className="mb-0">
          <AppImage
            isLocalized
            alt={page.data.hero.title}
            className="w-full h-auto rounded-none"
            height={1080}
            loading="eager"
            src={`${competitor}.png`}
            width={1920}
          />
        </ShowcaseFrame>
      </div>

      <ComparisonTable
        competitor2Name={page.data.comparison.competitor2Name}
        competitorName={page.data.comparison.competitorName}
        sections={page.data.comparison.sections.map((section) => ({
          title: section.title,
          features: section.features.map((feature) => ({
            name: feature.name,
            source: feature.source,
            competitor: feature.competitor,
            competitor2: feature.competitor2,
          })),
        }))}
        title={page.data.comparison.title}
      />

      <section className="relative py-12 md:py-16 w-full max-w-6xl mx-auto px-4">
        <Toc items={page.data.toc}>
          <div className="prose prose-sm prose-neutral dark:prose-invert max-w-none">
            <MDX components={components} />
          </div>
        </Toc>
      </section>

      <CTASection {...page.data.cta} />

      <Footer />
    </div>
  );
}
