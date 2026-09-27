import type { Metadata } from "next";

import { LegalMdxPage } from "../components/legal-mdx-page";
import { generateMetadataFromMeta } from "@/core/fumadocs/metadata";
import { enableStaticLocale, type StaticLocaleProps } from "@/i18n/static-locale";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return generateMetadataFromMeta({ locale, route: "/imprint" });
}

export default async function ImprintPage({ params }: StaticLocaleProps) {
  await enableStaticLocale(params);

  return <LegalMdxPage slug="imprint" />;
}
