import type { Metadata } from "next";

import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import { AutomationHero } from "./components/automation-hero";
import { AutomationDemo } from "./components/automation-demo";
import { AutomationBenefits } from "./components/automation-benefits";

import { CTASection } from "@/components/marketing/cta-section";
import { FAQSection } from "@/components/marketing/faq-section";
import { FeatureSection } from "@/components/marketing/feature-section";
import { Footer } from "@/app/components/footer";
import { JsonLd } from "@/components/seo/json-ld";
import { generateMetadataFromMeta } from "@/core/fumadocs/metadata";
import { automationSource } from "@/core/fumadocs/source";
import { breadcrumbListSchema } from "@/core/seo/schemas";
import { contentLocaleOrDefault } from "@/i18n/locale-registry";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return generateMetadataFromMeta({ locale, route: "/n8n-crm" });
}

export default async function AutomationPage() {
  const [rawLocale, t] = await Promise.all([getLocale(), getTranslations("StructuredData.breadcrumb")]);
  const locale = contentLocaleOrDefault(rawLocale);
  const automationPage = automationSource.getPage(["automation"], locale);

  if (!automationPage) notFound();

  const { architecture, hero, benefits, features, faq, cta } = automationPage.data;

  return (
    <div className="flex flex-col items-center justify-center" data-marketing-flow="continuous">
      <JsonLd
        schema={breadcrumbListSchema([
          { name: t("home"), path: `/${locale}` },
          { name: "n8n CRM", path: `/${locale}/n8n-crm` },
        ])}
      />

      <AutomationHero {...hero} />

      <AutomationDemo architecture={architecture} />

      <AutomationBenefits benefitsSection={benefits} />

      <FeatureSection {...features} />

      <FAQSection {...faq} />

      <CTASection {...cta} />

      <Footer />
    </div>
  );
}
