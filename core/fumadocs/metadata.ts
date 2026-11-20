import type { Metadata } from "next";

import { notFound } from "next/navigation";

import { ROUTE_SOURCE_MAP } from "./route-source-map";

import { env } from "@/env";
import { buildAlternateLanguages } from "@/core/seo/alternates";
import { buildPageMetadata } from "@/core/seo/page-metadata";
import {
  DEFAULT_LOCALE,
  isContentLocale,
  isMarketingPathPublished,
  marketingLocalesForPath,
} from "@/i18n/locale-registry";
import { isContentPathname, isNoindexPublicRoute } from "@/i18n/routing";

type GenerateMetadataParams = {
  canonicalPath?: string;
  locale: string;
  route: keyof typeof ROUTE_SOURCE_MAP;
  params?: Record<string, string>;
  descriptionSuffix?: string;
  titleSuffix?: string;
  type?: "article" | "website";
};
export function generateMetadataFromMeta({
  canonicalPath,
  locale,
  route,
  params = {},
  descriptionSuffix,
  titleSuffix,
  type = "website",
}: GenerateMetadataParams): Metadata {
  const { source, path: mappedPath } = ROUTE_SOURCE_MAP[route];
  const path = mappedPath.map((part) => (part.startsWith(":") ? (params[part.slice(1)] ?? part) : part));
  const noindex = isNoindexPublicRoute(route);
  const metadataLocale = noindex && !isContentPathname(route) && !isContentLocale(locale) ? DEFAULT_LOCALE : locale;
  const routePath = buildRoutePath(route, params);
  const publicPath = canonicalPath ?? routePath;
  const page =
    isContentLocale(metadataLocale) || isMarketingPathPublished(metadataLocale, publicPath)
      ? source.getPage(path, metadataLocale)
      : undefined;
  const isSlugRoute = mappedPath.some((part) => part.startsWith(":"));

  if (!page) {
    if (isSlugRoute || !isContentLocale(locale)) notFound();
    throw new Error(`No content page backs ${route} in locale ${locale}; it would ship with no canonical`);
  }

  const baseTitle = page.data.title?.trim() || "";
  const title = titleSuffix ? `${baseTitle} - ${titleSuffix}` : baseTitle;
  const baseDescription = page.data.description?.trim() || "";
  const description =
    descriptionSuffix && baseDescription ? `${baseDescription} - ${descriptionSuffix}` : baseDescription;

  if (!baseTitle) throw new Error(`The content page backing ${route} in locale ${locale} has no title`);

  const translatedLocales = marketingLocalesForPath(publicPath).filter(
    (loc) => source.getPage(path, loc) !== undefined,
  );
  const alternates = buildAlternateLanguages(publicPath, translatedLocales, env.BASE_URL);

  return buildPageMetadata({ description, languages: alternates, locale, noindex, publicPath, title, type });
}

function buildRoutePath(route: string, params: Record<string, string>): string {
  if (Object.keys(params).length === 0) return route;

  let path = route;
  for (const [key, value] of Object.entries(params)) if (value) path = path.replace(`:${key}`, value);

  return path;
}
