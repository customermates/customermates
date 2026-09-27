import type { Metadata } from "next";

import { generateForHubMetadata, renderForHub } from "./for-hub";

import { enableStaticLocale, type StaticLocaleProps } from "@/i18n/static-locale";

export async function generateMetadata({ params }: StaticLocaleProps): Promise<Metadata> {
  const { locale } = await params;
  return generateForHubMetadata(locale, 1);
}

export default async function ForHubPage({ params }: StaticLocaleProps) {
  const locale = await enableStaticLocale(params);
  return renderForHub(locale, 1);
}
