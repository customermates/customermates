import type { Metadata } from "next";

import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";

import { Footer } from "../../components/footer";

import { HomepageHero } from "./components/homepage-hero";
import { HomepagePlans } from "./components/homepage-plans";
import { HomepageClosing, HomepageFaq } from "./components/homepage-closing";
import { HomepageIntegrations } from "./components/homepage-integrations";
import { HomepagePillars } from "./components/homepage-pillars";
import { HomepageProofPartners } from "./components/homepage-proof-partners";
import { HomepageFollowUp } from "./components/homepage-follow-up";
import { HomepageWorkspaceGenerator } from "./components/homepage-workspace-generator";
import { ProductFilm } from "@/components/marketing/product-film";
import { UseCasesSection } from "@/components/marketing/use-cases-section";
import { JsonLd } from "@/components/seo/json-ld";
import { homepageSource } from "@/core/fumadocs/source";
import { buildHomepageMetadata } from "@/core/seo/homepage-metadata";
import { organizationSchema, softwareApplicationSchema } from "@/core/seo/schemas";
import { isMarketingPathPublished, marketingLocalesForPath } from "@/i18n/locale-registry";
import { enableMarketingLocale, type StaticLocaleProps } from "@/i18n/static-locale";

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;

  if (!isMarketingPathPublished(locale, "/")) return {};

  const homepagePage = homepageSource.getPage(["homepage"], locale);

  if (!homepagePage) return {};

  const translatedLocales = marketingLocalesForPath("/").filter(
    (marketingLocale) => homepageSource.getPage(["homepage"], marketingLocale) !== undefined,
  );

  return buildHomepageMetadata({
    locale,
    rootMetadata: homepagePage.data.rootMetadata,
    translatedLocales,
  });
}

export default async function HomePage({ params }: StaticLocaleProps) {
  await enableMarketingLocale(params, "/");

  const locale = await getLocale();
  const homepagePage = homepageSource.getPage(["homepage"], locale);

  if (!homepagePage) notFound();

  const { closingEyebrow, cta, faq, followUp, generator, hero, pillars, plansTeaser, proofAndPartners, useCases } =
    homepagePage.data;

  return (
    <div
      className="flex w-full flex-col items-center overflow-x-clip bg-background text-foreground"
      data-homepage="marketing"
      data-marketing-flow="continuous"
    >
      <JsonLd schema={organizationSchema()} />

      <JsonLd
        schema={softwareApplicationSchema({
          description: homepagePage.data.description,
          locale,
        })}
      />

      <HomepageHero heroSection={hero} />

      <ProductFilm />

      <UseCasesSection useCases={useCases} />

      <HomepageIntegrations />

      <HomepageWorkspaceGenerator generator={generator} locale={locale} />

      <HomepageFollowUp followUp={followUp} />

      <HomepagePillars pillars={pillars} />

      <HomepageProofPartners content={proofAndPartners} />

      <HomepagePlans plans={plansTeaser} />

      <HomepageFaq {...faq} />

      <HomepageClosing {...cta} eyebrow={closingEyebrow} />

      <Footer />
    </div>
  );
}
