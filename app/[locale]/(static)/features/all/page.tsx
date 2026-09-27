import type { Metadata } from "next";

import { generateFeaturesAllHubMetadata, renderFeaturesAllHub } from "./features-all-hub";

import { enableStaticLocale, type StaticLocaleProps } from "@/i18n/static-locale";

export async function generateMetadata({ params }: StaticLocaleProps): Promise<Metadata> {
  const { locale } = await params;
  return generateFeaturesAllHubMetadata(locale, 1);
}

export default async function FeaturesAllHubPage({ params }: StaticLocaleProps) {
  const locale = await enableStaticLocale(params);
  return renderFeaturesAllHub(locale, 1);
}
