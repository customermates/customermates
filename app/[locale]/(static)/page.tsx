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
import { JsonLd } from "@/components/seo/json-ld";
import { homepageSource } from "@/core/fumadocs/source";
import { buildHomepageMetadata } from "@/core/seo/homepage-metadata";
import { organizationSchema, softwareApplicationSchema } from "@/core/seo/schemas";
import { CONTENT_LOCALES, isContentLocale } from "@/i18n/locale-registry";

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;

  if (!isContentLocale(locale)) return {};

  const homepagePage = homepageSource.getPage(["homepage"], locale);

  if (!homepagePage) return {};

  const translatedLocales = CONTENT_LOCALES.filter(
    (contentLocale) => homepageSource.getPage(["homepage"], contentLocale) !== undefined,
  );

  return buildHomepageMetadata({
    locale,
    rootMetadata: homepagePage.data.rootMetadata,
    translatedLocales,
  });
}

export default async function HomePage() {
  const locale = await getLocale();
  const homepagePage = homepageSource.getPage(["homepage"], locale);

  if (!homepagePage) notFound();

  const { hero, howItWorks, walkthrough, benefits, features, faq, cta } = homepagePage.data;

  return (
    <div className="flex w-full flex-col items-center overflow-x-clip bg-background text-foreground">
      <JsonLd schema={organizationSchema()} />

      <JsonLd
        schema={softwareApplicationSchema({
          description: homepagePage.data.description,
          locale,
        })}
      />

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

      <FeatureSection {...features} variant="editorial" />

      <HomepagePricing />

      <FAQSection {...faq} variant="editorial" />

      <CTASection {...cta} variant="editorial" />

      <Footer />
    </div>
  );
}
