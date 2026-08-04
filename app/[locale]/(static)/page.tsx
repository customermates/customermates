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
import { homepageSource, pricingSource } from "@/core/fumadocs/source";
import { organizationSchema, softwareApplicationSchema } from "@/core/seo/schemas";

export default async function HomePage() {
  const locale = await getLocale();
  const homepagePage = homepageSource.getPage(["homepage"], locale);

  if (!homepagePage) notFound();

  const { hero, howItWorks, walkthrough, benefits, features, faq, cta } = homepagePage.data;

  const pricingCards = pricingSource.getPage(["pricing"], locale)?.data.pricing.pricingCards ?? [];

  return (
    <div className="flex flex-col items-center">
      <JsonLd schema={organizationSchema()} />

      <JsonLd
        schema={softwareApplicationSchema({
          description: homepagePage.data.description,
          locale,
          prices: pricingCards.map((card) => card.price),
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

      <FeatureSection {...features} />

      <HomepagePricing />

      <FAQSection {...faq} />

      <CTASection {...cta} />

      <Footer />
    </div>
  );
}
