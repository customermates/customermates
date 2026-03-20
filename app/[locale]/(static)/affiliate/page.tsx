import type { Metadata } from "next";

import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";

import { AffiliateHero } from "./components/affiliate-hero";

import { Footer } from "@/app/components/footer";
import { XComparisonTable } from "@/components/x-comparison-table/x-comparison-table";
import { XFAQSection } from "@/components/x-faq-section";
import { XCTASection } from "@/components/x-cta-section";
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
    <div className="flex flex-col items-center justify-center">
      <AffiliateHero heroSection={page.data.hero} />

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

      <XFAQSection {...page.data.faq} />

      <XCTASection {...page.data.cta} />

      <Footer />
    </div>
  );
}
