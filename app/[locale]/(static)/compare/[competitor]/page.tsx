import type { Metadata } from "next";

import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";

import { ComparisonHero } from "./comparison-hero";

import { Footer } from "@/app/components/footer";
import { XComparisonTable } from "@/components/x-comparison-table/x-comparison-table";
import { generateMetadataFromMeta } from "@/core/fumadocs/metadata";
import { compareSource } from "@/core/fumadocs/source";
import { getMDXComponents } from "@/core/fumadocs/mdx-components";
import { XCTASection } from "@/components/x-cta-section";
import { XTOC } from "@/components/x-toc";

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
  const page = compareSource.getPage([competitor], locale);

  if (!page) notFound();

  const MDX = page.data.body;
  const components = getMDXComponents();

  return (
    <div className="flex flex-col items-center justify-center pt-16 md:pt-24">
      <ComparisonHero {...page.data.hero} />

      <XComparisonTable
        competitorName={page.data.comparison.competitorName}
        sections={page.data.comparison.sections.map((section) => ({
          title: section.title,
          features: section.features.map((feature) => ({
            name: feature.name,
            source: feature.source,
            competitor: feature.competitor,
          })),
        }))}
        title={page.data.comparison.title}
      />

      <section className="py-12 md:py-16 w-full max-w-6xl mx-auto px-4">
        <XTOC items={page.data.toc}>
          <div className="prose prose-sm prose-neutral dark:prose-invert max-w-none">
            <MDX components={components} />
          </div>
        </XTOC>
      </section>

      <XCTASection {...page.data.cta} />

      <Footer />
    </div>
  );
}
