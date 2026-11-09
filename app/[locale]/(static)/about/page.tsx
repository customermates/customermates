import type { Metadata } from "next";

import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";

import { Footer } from "@/app/components/footer";
import { LandingArticle } from "@/components/marketing/landing-article";
import { PageHero } from "@/components/marketing/page-hero";
import { JsonLd } from "@/components/seo/json-ld";
import { generateMetadataFromMeta } from "@/core/fumadocs/metadata";
import { getMDXComponents } from "@/core/fumadocs/mdx-components";
import { aboutSource } from "@/core/fumadocs/source";
import { founderProfileSchema } from "@/core/seo/schemas";
import { contentLocaleOrDefault } from "@/i18n/locale-registry";
import { enableStaticLocale, type StaticLocaleProps } from "@/i18n/static-locale";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return generateMetadataFromMeta({ locale, route: "/about" });
}

export default async function AboutPage({ params }: StaticLocaleProps) {
  await enableStaticLocale(params);

  const locale = contentLocaleOrDefault(await getLocale());
  const page = aboutSource.getPage(["about"], locale);

  if (!page) notFound();

  const MDX = page.data.body;

  return (
    <div className="flex flex-col items-center justify-center" data-marketing-flow="continuous">
      <JsonLd schema={founderProfileSchema(locale)} />

      <PageHero
        description={page.data.description}
        showOpenSourceBadge={false}
        title={page.data.heading ?? page.data.title}
      />

      <LandingArticle founderContact items={page.data.toc}>
        <MDX components={getMDXComponents()} />
      </LandingArticle>

      <Footer />
    </div>
  );
}
