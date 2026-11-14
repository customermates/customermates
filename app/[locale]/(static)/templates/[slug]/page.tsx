import type { Metadata } from "next";

import { notFound } from "next/navigation";

import { TemplateDetail } from "@/components/marketing/templates/template-detail";
import { generateTemplatePageMetadata } from "@/core/templates/template-metadata";
import { pagePublicationOptions } from "@/core/templates/template-deployment";
import { pageTemplates, templateVisibilityBySlug } from "@/core/templates/template-publication";
import { isMarketingLocale } from "@/i18n/locale-registry";
import { enableMarketingLocale } from "@/i18n/static-locale";

interface Props {
  params: Promise<{
    locale: string;
    slug: string;
  }>;
}

export function generateStaticParams({ params }: { params: { locale: string } }) {
  if (!isMarketingLocale(params.locale)) return [];

  return pageTemplates(params.locale, pagePublicationOptions()).map((item) => ({ slug: item.entry.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;

  return generateTemplatePageMetadata(locale, slug);
}

export default async function TemplatePage({ params }: Props) {
  const { slug } = await params;
  const locale = await enableMarketingLocale(params, `/templates/${slug}`);
  const found = templateVisibilityBySlug(slug, locale, pagePublicationOptions());

  if (!found || (found.visibility !== "own" && found.visibility !== "proof")) notFound();

  return <TemplateDetail locale={locale} slug={slug} visibility={found.visibility} />;
}
