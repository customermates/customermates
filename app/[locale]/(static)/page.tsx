import type { Metadata } from "next";

import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";

import { Footer } from "../../components/footer";

import { HomepageHero } from "./components/homepage-hero";
import { HomepageDemo } from "./components/homepage-demo";
import { HomepageBenefits } from "./components/homepage-benefits";
import { HomepagePricing } from "./components/homepage-pricing";

import { XCTASection } from "@/components/x-cta-section";
import { XFAQSection } from "@/components/x-faq-section";
import { XFeatureSection } from "@/components/x-feature-section";
import { XTestimonialSection } from "@/components/x-testimonial-section";
import { generateMetadataFromMeta } from "@/core/fumadocs/metadata";
import { homepageSource, pricingSource } from "@/core/fumadocs/source";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return generateMetadataFromMeta({ locale, route: "/" });
}

export default async function HomePage() {
  const locale = await getLocale();
  const homepagePage = homepageSource.getPage(["homepage"], locale);
  const pricingPage = pricingSource.getPage(["pricing"], locale);

  if (!homepagePage) notFound();

  const { hero, benefits, features, testimonials, pricingTitle, faq, cta } = homepagePage.data;
  const pricingData = pricingPage?.data.pricing;

  return (
    <div className="flex flex-col items-center justify-center pt-16 md:pt-24">
      <HomepageHero heroSection={hero} />

      <HomepageDemo />

      <HomepageBenefits benefitsSection={benefits} />

      <XFeatureSection {...features} />

      <XTestimonialSection testimonialsSection={testimonials} />

      {pricingData && <HomepagePricing pricingSection={pricingData} pricingSectionTitle={pricingTitle} />}

      <XFAQSection {...faq} />

      <XCTASection {...cta} />

      <Footer />
    </div>
  );
}
