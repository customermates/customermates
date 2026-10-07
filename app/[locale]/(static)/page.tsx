import type { Metadata } from "next";

import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";

import { Footer } from "../../components/footer";

import { HomepageHero } from "./components/homepage-hero";
import { HomepageStatsRow } from "./components/homepage-stats-row";
import { HomepageWalkthrough } from "./components/homepage-walkthrough";
import { HomepageHowItWorks } from "./components/homepage-how-it-works";
import { HomepageBenefits, HomepageFacts } from "./components/homepage-benefits";
import { HomepagePricing } from "./components/homepage-pricing";
import { HomepagePipeline } from "./components/homepage-pipeline";
import { HomepageClosing, HomepageFaq } from "./components/homepage-closing";
import { HomepageLiveDemo } from "./components/homepage-live-demo";
import { HomepageProductProof } from "./components/homepage-product-proof";
import { HomepageRoutines } from "./components/homepage-routines";
import { HomepageStory } from "./components/homepage-story";
import { JsonLd } from "@/components/seo/json-ld";
import { homepageSource } from "@/core/fumadocs/source";
import { buildHomepageMetadata } from "@/core/seo/homepage-metadata";
import { organizationSchema, softwareApplicationSchema } from "@/core/seo/schemas";
import { CONTENT_LOCALES, contentLocaleOrDefault, isContentLocale } from "@/i18n/locale-registry";
import { enableStaticLocale, type StaticLocaleProps } from "@/i18n/static-locale";

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

export default async function HomePage({ params }: StaticLocaleProps) {
  await enableStaticLocale(params);

  const locale = await getLocale();
  const homepagePage = homepageSource.getPage(["homepage"], locale);

  if (!homepagePage) notFound();

  const contentLocale = contentLocaleOrDefault(locale);
  const {
    benefits,
    closingEyebrow,
    cta,
    faq,
    flow,
    hero,
    howItWorks,
    pipelineStory,
    productProof,
    routines,
    walkthrough,
  } = homepagePage.data;

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

      <HomepageHero heroSection={hero} locale={contentLocale} />

      <HomepageFacts benefitsSection={benefits} />

      <HomepageStory flow={flow} />

      <HomepageStatsRow />

      {walkthrough ? <HomepageWalkthrough locale={contentLocale} walkthrough={walkthrough} /> : null}

      {howItWorks ? (
        <HomepageHowItWorks
          eyebrow={howItWorks.eyebrow}
          handoff={howItWorks.handoff}
          locale={contentLocale}
          steps={howItWorks.steps}
          title={howItWorks.title}
        />
      ) : null}

      <HomepagePipeline locale={contentLocale} story={pipelineStory} />

      <HomepageRoutines locale={contentLocale} routines={routines} />

      <HomepageLiveDemo locale={contentLocale} proof={productProof} />

      <HomepageProductProof proof={productProof} />

      <HomepageBenefits benefitsSection={benefits} />

      <HomepagePricing />

      <HomepageFaq {...faq} />

      <HomepageClosing {...cta} eyebrow={closingEyebrow} />

      <Footer />
    </div>
  );
}
