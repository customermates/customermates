import type { Metadata } from "next";

import { generateCompareHubMetadata, renderCompareHub } from "./compare-hub";

import { enableStaticLocale, type StaticLocaleProps } from "@/i18n/static-locale";

export async function generateMetadata({ params }: StaticLocaleProps): Promise<Metadata> {
  const { locale } = await params;
  return generateCompareHubMetadata(locale, 1);
}

export default async function CompareHubPage({ params }: StaticLocaleProps) {
  const locale = await enableStaticLocale(params);
  return renderCompareHub(locale, 1);
}
