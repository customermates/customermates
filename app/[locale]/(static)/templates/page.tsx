import type { Metadata } from "next";

import { getTranslations, setRequestLocale } from "next-intl/server";

import { TemplatesHub } from "@/components/marketing/templates/template-hub";
import { generateTemplatesHubMetadata } from "@/core/templates/template-metadata";
import { enableMarketingLocale, type StaticLocaleProps } from "@/i18n/static-locale";

export async function generateMetadata({ params }: StaticLocaleProps): Promise<Metadata> {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("TemplatePages");

  return generateTemplatesHubMetadata(locale, {
    description: t("hubMetaDescription"),
    title: t("hubMetaTitle"),
  });
}

export default async function TemplatesHubPage({ params }: StaticLocaleProps) {
  const locale = await enableMarketingLocale(params, "/templates");

  return <TemplatesHub locale={locale} />;
}
