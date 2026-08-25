import type { Metadata } from "next";

import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";

import { PricingSection } from "./components/pricing-section";
import { PricingComparisonTable } from "./components/pricing-comparison-table";

import { Footer } from "@/app/components/footer";
import { AgplGithubBadge } from "@/components/marketing/agpl-github-badge";
import { FAQSection } from "@/components/marketing/faq-section";
import { CTASection } from "@/components/marketing/cta-section";
import { WaveDecoration } from "@/components/marketing/wave-decoration";
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
      <JsonLd schema={softwareApplicationSchema({ description: page.data.description, locale })} />

      <section className="relative isolate pt-16 md:pt-24 pb-8 md:pb-12 w-full">
        <WaveDecoration
          className="-top-10 -left-40 w-[min(1000px,90vw)] md:-top-24 md:-left-56"
          opacity={0.45}
          variant="wave-1"
        />

        <WaveDecoration
          className="-top-4 right-0 hidden w-[min(700px,55vw)] md:block md:-top-8 md:-right-20"
          opacity={0.3}
          variant="wave-2"
        />

        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 z-[5] h-[520px] bg-[radial-gradient(ellipse_50%_55%_at_50%_45%,var(--background)_0%,color-mix(in_oklab,var(--background)_80%,transparent)_30%,transparent_85%)]"
        />

        <div className="relative z-10 max-w-7xl mx-auto px-4">
          <div className="mb-12 text-center max-w-3xl mx-auto flex flex-col items-center">
            <AgplGithubBadge />

            <h1 className="text-x-4xl tracking-tight pb-3 text-transparent bg-clip-text bg-linear-to-b from-neutral-900 via-neutral-700 to-neutral-500 dark:from-white dark:via-gray-200 dark:to-gray-400">
              {page.data.title}
            </h1>

            {page.data.titleAccent ? (
              <div
                className="mb-4 text-[26px] italic text-primary sm:text-[32px] md:text-[36px] tracking-[-0.02em]"
                style={{ fontFamily: "var(--font-serif)" }}
              >
                {page.data.titleAccent}
              </div>
            ) : null}

            <h2 className="text-x-lg text-subdued">{page.data.description}</h2>
          </div>

          <PricingSection {...page.data.pricing} />
        </div>
      </section>

      <PricingComparisonTable {...page.data.comparison} locale={locale} />

      <FAQSection {...page.data.faq} />

      <CTASection {...page.data.cta} />

      <Footer />
    </div>
  );
}
