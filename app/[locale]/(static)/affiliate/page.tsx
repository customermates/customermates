import type { Metadata } from "next";

import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";

import { Footer } from "@/app/components/footer";
import { ComparisonTable } from "@/components/marketing/comparison-table";
import { FAQSection } from "@/components/marketing/faq-section";
import { CTASection } from "@/components/marketing/cta-section";
import { PageHero } from "@/components/marketing/page-hero";
import { generateMetadataFromMeta } from "@/core/fumadocs/metadata";
import { affiliateSource } from "@/core/fumadocs/source";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return generateMetadataFromMeta({ locale, route: "/affiliate" });
}

export default async function AffiliatePage() {
  const locale = await getLocale();
  const page = affiliateSource.getPage(["affiliate"], locale);

  if (!page) notFound();

  return (
    <div className="flex flex-col items-center justify-center" data-marketing-flow="continuous">
      <PageHero {...page.data.hero} showOpenSourceBadge={false} />

      <ComparisonTable
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

      <FAQSection {...page.data.faq} />

      <CTASection {...page.data.cta} />

      <Footer />
    </div>
  );
}
