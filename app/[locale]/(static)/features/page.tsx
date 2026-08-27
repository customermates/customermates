import type { Metadata } from "next";

import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";

import { BaseFeaturesSection } from "./components/base-features-section";
import { FeaturesHero } from "./components/features-hero";
import { WhyFeaturesSection } from "./components/why-features-section";

import { Footer } from "@/app/components/footer";
import { CTASection } from "@/components/marketing/cta-section";
import { generateMetadataFromMeta } from "@/core/fumadocs/metadata";
import { featuresSource } from "@/core/fumadocs/source";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return generateMetadataFromMeta({ locale, route: "/features" });
}

export default async function FeaturesPage() {
  const locale = await getLocale();
  const page = featuresSource.getPage(["features"], locale);

  if (!page) notFound();

  const cta = page.data.cta;
  const features = page.data.features;
  const hero = page.data.hero;
  const why = page.data.why;

  return (
    <div className="flex flex-col items-center justify-center">
      <FeaturesHero {...hero} />

      {features.map((section, index) => (
        <BaseFeaturesSection key={index} index={index} {...section} />
      ))}

      <WhyFeaturesSection {...why} />

      <CTASection {...cta} />

      <Footer />
    </div>
  );
}
