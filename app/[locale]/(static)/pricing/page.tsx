import type { Metadata } from "next";

import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";

import { PricingSection } from "./components/pricing-section";
import { PricingComparisonTable } from "./components/pricing-comparison-table";

import { Footer } from "@/app/components/footer";
import { XFAQSection } from "@/components/x-faq-section";
import { XCTASection } from "@/components/x-cta-section";
import { generateMetadataFromMeta } from "@/core/fumadocs/metadata";
import { pricingSource } from "@/core/fumadocs/source";

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
      <section className="py-16 md:py-24 w-full">
        <div className="max-w-7xl mx-auto px-4">
          <div className="mb-12 text-center max-w-3xl mx-auto">
            <h1 className="text-x-4xl tracking-tight pb-4 text-transparent bg-clip-text bg-linear-to-b from-neutral-900 via-neutral-700 to-neutral-500 dark:from-white dark:via-gray-200 dark:to-gray-400">
              {page.data.title}
            </h1>

            <h2 className="text-x-lg text-subdued">{page.data.description}</h2>
          </div>

          <PricingSection {...page.data.pricing} />
        </div>
      </section>

      <PricingComparisonTable {...page.data.comparison} />

      <XFAQSection {...page.data.faq} />

      <XCTASection {...page.data.cta} />

      <Footer />
    </div>
  );
}
