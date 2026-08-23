import type { Metadata } from "next";

import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import { PageHero } from "@/components/marketing/page-hero";
import { Footer } from "@/app/components/footer";
import { ComparisonTable } from "@/components/marketing/comparison-table";
import { MarketingContainer } from "@/components/marketing/marketing-container";
import { ShowcaseFrame } from "@/components/marketing/showcase-frame";
import { AppImage } from "@/components/shared/app-image";
import { JsonLd } from "@/components/seo/json-ld";
import { generateMetadataFromMeta } from "@/core/fumadocs/metadata";
import { comparePagesSource } from "@/core/fumadocs/source";
import { getMDXComponents } from "@/core/fumadocs/mdx-components";
import { CTASection } from "@/components/marketing/cta-section";
import { FAQSection } from "@/components/marketing/faq-section";
import { Toc } from "@/components/shared/toc";
import { breadcrumbListSchema, faqPageSchema, softwareApplicationSchema } from "@/core/seo/schemas";

interface Props {
  params: Promise<{
    locale: string;
    competitor: string;
  }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, competitor } = await params;

  return generateMetadataFromMeta({
    locale,
    route: "/compare/:competitor",
    params: { competitor },
  });
}

export default async function CompetitorComparePage({ params }: Props) {
  const locale = await getLocale();
  const t = await getTranslations("StructuredData.breadcrumb");
  const { competitor } = await params;
  const page = comparePagesSource.getPage([competitor], locale);

  if (!page) notFound();

  const faqPage = page.data.faq ? faqPageSchema({ faqs: page.data.faq.faqs }) : undefined;
  const MDX = page.data.body;
  const components = getMDXComponents();

  return (
    <div className="flex flex-col items-center justify-center pt-16 md:pt-24">
      <JsonLd
        schema={breadcrumbListSchema([
          { name: t("home"), path: `/${locale}` },
          { name: t("compare"), path: `/${locale}/compare` },
          { name: page.data.competitorName, path: `/${locale}/compare/${competitor}` },
        ])}
      />

      <JsonLd schema={softwareApplicationSchema({ description: page.data.description, locale })} />

      {faqPage ? <JsonLd schema={faqPage} /> : null}

      <PageHero {...page.data.hero} />

      <MarketingContainer className="mb-8">
        <ShowcaseFrame className="mb-0" withHorizontalPadding={false}>
          <AppImage
            isLocalized
            alt={page.data.hero.title}
            className="w-full h-auto rounded-none"
            height={1080}
            loading="eager"
            src={`${competitor}.png`}
            width={1920}
          />
        </ShowcaseFrame>
      </MarketingContainer>

      <ComparisonTable
        competitor2Name={page.data.comparison.competitor2Name}
        competitorName={page.data.comparison.competitorName}
        sections={page.data.comparison.sections.map((section) => ({
          title: section.title,
          features: section.features.map((feature) => ({
            name: feature.name,
            source: feature.source,
            competitor: feature.competitor,
            competitor2: feature.competitor2,
          })),
        }))}
        title={page.data.comparison.title}
      />

      <section className="w-full py-12 md:py-16">
        <MarketingContainer>
          <Toc items={page.data.toc}>
            <div className="prose prose-neutral max-w-none dark:prose-invert prose-headings:font-medium prose-headings:tracking-tight prose-h2:text-display-sm prose-h2:mt-16 prose-h2:mb-5 prose-h3:text-xl prose-h3:mt-10 prose-p:leading-relaxed prose-a:text-primary prose-a:no-underline hover:prose-a:underline">
              <MDX components={components} />
            </div>
          </Toc>
        </MarketingContainer>
      </section>

      {page.data.faq ? <FAQSection {...page.data.faq} /> : null}

      <CTASection {...page.data.cta} />

      <Footer />
    </div>
  );
}
