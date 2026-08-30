import type { MetadataRoute } from "next";
import type { ContentLocale } from "@/i18n/locale-registry";

import { buildLocalePath } from "@/i18n/locale-registry";

import { buildAlternateLanguages } from "./alternates";

export type LocalizedRoute = {
  locale: ContentLocale;
  routePath: string;
  lastModified?: Date;
};

type SitemapPageData = { blogPost?: { date?: string }; lastModified?: Date };

export function resolvePageLastModified(data: object): Date | undefined {
  const generated = (data as SitemapPageData).lastModified;
  if (generated instanceof Date && !isNaN(generated.getTime())) return generated;

  const published = (data as SitemapPageData).blogPost?.date;
  if (!published) return undefined;

  const date = new Date(published);
  return isNaN(date.getTime()) ? undefined : date;
}

export function assembleSitemap(localizedRoutes: readonly LocalizedRoute[], baseUrl: string): MetadataRoute.Sitemap {
  const localesByRoutePath = new Map<string, ContentLocale[]>();

  for (const { routePath, locale } of localizedRoutes) {
    const known = localesByRoutePath.get(routePath);
    if (known) {
      if (!known.includes(locale)) known.push(locale);
      continue;
    }
    localesByRoutePath.set(routePath, [locale]);
  }

  return localizedRoutes.map(({ locale, routePath, lastModified }) => {
    const languages = buildAlternateLanguages(routePath, localesByRoutePath.get(routePath) ?? [], baseUrl);

    return {
      url: `${baseUrl}${buildLocalePath(locale, routePath)}`,
      ...(lastModified ? { lastModified } : {}),
      ...(languages ? { alternates: { languages } } : {}),
    };
  });
}
