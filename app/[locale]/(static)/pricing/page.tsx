import type { Metadata } from "next";

import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";

import { PricingSection } from "./components/pricing-section";
import { PricingComparisonTable } from "./components/pricing-comparison-table";
import { PricingFaqSection } from "./components/pricing-faq-section";

import { Footer } from "@/app/components/footer";
import { CTASection } from "@/components/marketing/cta-section";
import { MarketingSection } from "@/components/marketing/marketing-section";
import { PageHero } from "@/components/marketing/page-hero";
import { generateMetadataFromMeta } from "@/core/fumadocs/metadata";
import { pricingSource } from "@/core/fumadocs/source";
import { JsonLd } from "@/components/seo/json-ld";
import { softwareApplicationSchema } from "@/core/seo/schemas";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return generateMetadataFromMeta({ locale, route: "/pricing" });
}

export default async function PricingPage() {
  const locale = await getLocale();
  const page = pricingSource.getPage(["pricing"], locale);

  if (!page) notFound();

  return (
    <div className="flex flex-col items-center justify-center">
      <JsonLd
        schema={softwareApplicationSchema({
          description: page.data.description,
          locale,
        })}
      />

      <PageHero
        buttonLeftHref={page.data.cta.buttonLeftHref}
        buttonLeftText={page.data.cta.buttonLeftText}
        buttonRightHref={page.data.cta.buttonRightHref}
        buttonRightText={page.data.cta.buttonRightText}
        description={page.data.description}
        hint={page.data.cta.hint}
        title={page.data.title}
        titleAccent={page.data.titleAccent}
      />

      <MarketingSection className="py-16 sm:py-20 lg:py-24">
        <PricingSection {...page.data.pricing} />
      </MarketingSection>

      <PricingComparisonTable {...page.data.comparison} locale={locale} />

      <PricingFaqSection {...page.data.faq} />

      <CTASection {...page.data.cta} />

      <Footer />
    </div>
  );
}
