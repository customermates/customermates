import type { Metadata } from "next";

import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import { Footer } from "@/app/components/footer";
import { PageHero } from "@/components/marketing/page-hero";
import { CTASection } from "@/components/marketing/cta-section";
import { MarketingContainer } from "@/components/marketing/marketing-container";
import { ShowcaseFrame } from "@/components/marketing/showcase-frame";
import { AppImage } from "@/components/shared/app-image";
import { JsonLd } from "@/components/seo/json-ld";
import { generateMetadataFromMeta } from "@/core/fumadocs/metadata";
import { forPagesSource } from "@/core/fumadocs/source";
import { getMDXComponents } from "@/core/fumadocs/mdx-components";
import { Toc } from "@/components/shared/toc";
import { breadcrumbListSchema, softwareApplicationSchema } from "@/core/seo/schemas";

interface Props {
  params: Promise<{
    locale: string;
    industry: string;
  }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, industry } = await params;

  return generateMetadataFromMeta({
    locale,
    route: "/for/:industry",
    params: { industry },
  });
}

export default async function ForIndustryPage({ params }: Props) {
  const locale = await getLocale();
  const t = await getTranslations("StructuredData.breadcrumb");
  const { industry } = await params;
  const page = forPagesSource.getPage([industry], locale);

  if (!page) notFound();

  const MDX = page.data.body;
  const components = getMDXComponents();

  return (
    <div className="relative flex flex-col items-center justify-center pt-16 md:pt-24">
      <JsonLd
        schema={breadcrumbListSchema([
          { name: t("home"), path: `/${locale}` },
          { name: t("industries"), path: `/${locale}/for` },
          { name: page.data.industryName, path: `/${locale}/for/${industry}` },
        ])}
      />

      <JsonLd schema={softwareApplicationSchema({ description: page.data.description, locale })} />

      <PageHero {...page.data.hero} />

      <MarketingContainer className="mb-8">
        <ShowcaseFrame className="mb-0" withHorizontalPadding={false}>
          <AppImage
            isLocalized
            alt={page.data.hero.title}
            className="w-full h-auto rounded-none"
            height={1080}
            loading="eager"
            src={`${industry}.png`}
            width={1920}
          />
        </ShowcaseFrame>
      </MarketingContainer>

      <section className="w-full py-12 md:py-16">
        <MarketingContainer>
          <Toc items={page.data.toc}>
            <div className="prose prose-neutral max-w-none dark:prose-invert prose-headings:font-medium prose-headings:tracking-tight prose-h2:text-display-sm prose-h2:mt-16 prose-h2:mb-5 prose-h3:text-xl prose-h3:mt-10 prose-p:leading-relaxed prose-a:text-primary prose-a:no-underline hover:prose-a:underline">
              <MDX components={components} />
            </div>
          </Toc>
        </MarketingContainer>
      </section>

      <CTASection {...page.data.cta} />

      <Footer />
    </div>
  );
}
