import type { Metadata } from "next";

import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";

import { Footer } from "@/app/components/footer";
import { PageHero } from "@/components/marketing/page-hero";
import { CTASection } from "@/components/marketing/cta-section";
import { ShowcaseFrame } from "@/components/marketing/showcase-frame";
import { AppImage } from "@/components/shared/app-image";
import { JsonLd } from "@/components/seo/json-ld";
import { generateMetadataFromMeta } from "@/core/fumadocs/metadata";
import { forPagesSource } from "@/core/fumadocs/source";
import { getMDXComponents } from "@/core/fumadocs/mdx-components";
import { Toc } from "@/components/shared/toc";
import { breadcrumbListSchema } from "@/core/seo/schemas";

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
  const { industry } = await params;
  const page = forPagesSource.getPage([industry], locale);

  if (!page) notFound();

  const MDX = page.data.body;
  const components = getMDXComponents();

  return (
    <div className="relative flex flex-col items-center justify-center pt-16 md:pt-24">
      <JsonLd
        schema={breadcrumbListSchema([
          { name: "Home", path: `/${locale}` },
          { name: "Industries", path: `/${locale}/for` },
          { name: page.data.industryName, path: `/${locale}/for/${industry}` },
        ])}
      />

      <PageHero {...page.data.hero} />

      <div className="relative w-full max-w-6xl mx-auto px-4 mb-8">
        <ShowcaseFrame className="mb-0">
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
      </div>

      <section className="relative py-12 md:py-16 w-full max-w-6xl mx-auto px-4">
        <Toc items={page.data.toc}>
          <div className="prose prose-sm prose-neutral dark:prose-invert max-w-none">
            <MDX components={components} />
          </div>
        </Toc>
      </section>

      <CTASection {...page.data.cta} />

      <Footer />
    </div>
  );
}
