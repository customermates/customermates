import type { Metadata } from "next";

import { notFound } from "next/navigation";

import { ROUTE_SOURCE_MAP } from "./route-source-map";

import { env } from "@/env";
import { buildAlternateLanguages } from "@/core/seo/alternates";
import { CONTENT_LOCALES, buildLocalePath, isContentLocale } from "@/i18n/locale-registry";
import { isNoindexPublicRoute } from "@/i18n/routing";

type GenerateMetadataParams = {
  canonicalPath?: string;
  locale: string;
  route: keyof typeof ROUTE_SOURCE_MAP;
  params?: Record<string, string>;
  titleSuffix?: string;
  type?: "article" | "website";
};
export function generateMetadataFromMeta({
  canonicalPath,
  locale,
  route,
  params = {},
  titleSuffix,
  type = "website",
}: GenerateMetadataParams): Metadata {
  const { source, path: mappedPath } = ROUTE_SOURCE_MAP[route];
  const path = mappedPath.map((part) => (part.startsWith(":") ? (params[part.slice(1)] ?? part) : part));
  const page = source.getPage(path, locale);
  const isSlugRoute = mappedPath.some((part) => part.startsWith(":"));

  if (!page) {
    if (isSlugRoute || !isContentLocale(locale)) notFound();
    throw new Error(`No content page backs ${route} in locale ${locale}; it would ship with no canonical`);
  }

  const baseTitle = page.data.title?.trim() || "";
  const title = titleSuffix ? `${baseTitle} - ${titleSuffix}` : baseTitle;
  const description = page.data.description?.trim() || "";

  if (!baseTitle) throw new Error(`The content page backing ${route} in locale ${locale} has no title`);

  const routePath = buildRoutePath(route, params);
  const publicPath = canonicalPath ?? routePath;
  const translatedLocales = CONTENT_LOCALES.filter((loc) => source.getPage(path, loc) !== undefined);
  const alternates = buildAlternateLanguages(publicPath, translatedLocales, env.BASE_URL);

  const canonical = `${env.BASE_URL}${buildLocalePath(locale, publicPath)}`;
  const ogImageParams = new URLSearchParams({ title });

  if (description) ogImageParams.set("description", description);

  const image = {
    alt: title,
    height: 630,
    url: `/og/image.png?${ogImageParams.toString()}`,
    width: 1200,
  };

  const noindex = isNoindexPublicRoute(route);

  const metadata: Metadata = {
    alternates: alternates && !noindex ? { canonical, languages: alternates } : { canonical },
    ...(noindex ? { robots: { follow: true, index: false } } : {}),
    openGraph: {
      description,
      images: [image],
      title,
      type,
    },
    twitter: {
      card: "summary_large_image",
      description,
      images: [image],
      title,
    },
    title,
  };

  if (description) metadata.description = description;

  return metadata;
}

function buildRoutePath(route: string, params: Record<string, string>): string {
  if (Object.keys(params).length === 0) return route;

  let path = route;
  for (const [key, value] of Object.entries(params)) if (value) path = path.replace(`:${key}`, value);

  return path;
}
