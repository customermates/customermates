import type { Metadata } from "next";

import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";

import { Footer } from "../../components/footer";

import { HomepageHero } from "./components/homepage-hero";
import { HomepageStatsRow } from "./components/homepage-stats-row";
import { HomepageWalkthrough } from "./components/homepage-walkthrough";
import { HomepageHowItWorks } from "./components/homepage-how-it-works";
import { HomepageBenefits } from "./components/homepage-benefits";
import { HomepagePricing } from "./components/homepage-pricing";
import { CTASection } from "@/components/marketing/cta-section";
import { FAQSection } from "@/components/marketing/faq-section";
import { FeatureSection } from "@/components/marketing/feature-section";
import { generateMetadataFromMeta } from "@/core/fumadocs/metadata";
import { homepageSource } from "@/core/fumadocs/source";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return generateMetadataFromMeta({ locale, route: "/" });
}

export default async function HomePage() {
  const locale = await getLocale();
  const homepagePage = homepageSource.getPage(["homepage"], locale);

  if (!homepagePage) notFound();

  const { hero, howItWorks, walkthrough, benefits, features, faq, cta } = homepagePage.data;

  return (
    <div className="flex flex-col items-center">
      <HomepageHero heroSection={hero} />

      <HomepageStatsRow />

      {walkthrough && <HomepageWalkthrough walkthrough={walkthrough} />}

      {howItWorks && (
        <HomepageHowItWorks
          clipTerminal={howItWorks.clipTerminal}
          eyebrow={howItWorks.eyebrow}
          steps={howItWorks.steps}
          title={howItWorks.title}
        />
      )}

      <HomepageBenefits benefitsSection={benefits} />

      <FeatureSection {...features} />

      <HomepagePricing />

      <FAQSection {...faq} />

      <CTASection {...cta} />

      <Footer />
    </div>
  );
}
