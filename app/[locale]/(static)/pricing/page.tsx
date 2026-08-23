import type { Metadata } from "next";

import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";

import { PricingSection } from "./components/pricing-section";
import { PricingComparisonTable } from "./components/pricing-comparison-table";

import { Footer } from "@/app/components/footer";
import { AgplGithubBadge } from "@/components/marketing/agpl-github-badge";
import { FAQSection } from "@/components/marketing/faq-section";
import { CTASection } from "@/components/marketing/cta-section";
import { MarketingContainer } from "@/components/marketing/marketing-container";
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
      <section className="w-full pt-16 pb-8 md:pt-24 md:pb-12">
        <MarketingContainer>
          <div className="mb-12 flex flex-col items-center text-center">
            <AgplGithubBadge />

            <h1 className="text-display m-0 max-w-5xl">{page.data.title}</h1>

            {page.data.titleAccent ? (
              <p
                className="mt-2 text-2xl italic tracking-tight text-primary sm:text-3xl md:text-4xl"
                style={{ fontFamily: "var(--font-serif)" }}
              >
                {page.data.titleAccent}
              </p>
            ) : null}

            <p className="text-lede mt-6">{page.data.description}</p>
          </div>

          <PricingSection {...page.data.pricing} />
        </MarketingContainer>
      </section>

      <PricingComparisonTable {...page.data.comparison} locale={locale} />

      <FAQSection {...page.data.faq} />

      <CTASection {...page.data.cta} />

      <Footer />
    </div>
  );
}
