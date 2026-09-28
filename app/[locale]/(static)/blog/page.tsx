import type { Metadata } from "next";

import { generateBlogHubMetadata, renderBlogHub } from "./blog-hub";

import { enableStaticLocale, type StaticLocaleProps } from "@/i18n/static-locale";

export async function generateMetadata({ params }: StaticLocaleProps): Promise<Metadata> {
  const { locale } = await params;
  return generateBlogHubMetadata(locale, 1);
}

export default async function BlogHubPage({ params }: StaticLocaleProps) {
  const locale = await enableStaticLocale(params);
  return renderBlogHub(locale, 1);
}
