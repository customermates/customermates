import type { MetadataRoute } from "next";
import type { ContentLocale } from "@/i18n/locale-registry";

import { buildLocalePath } from "@/i18n/locale-registry";

import { buildAlternateLanguages } from "./alternates";

export type LocalizedRoute = {
  locale: ContentLocale;
  routePath: string;
  lastModified?: Date;
};

type SitemapPageData = { blogPost?: { date?: Date | string }; lastModified?: Date };

export function resolvePageLastModified(data: object): Date | undefined {
  const { blogPost, lastModified } = data as SitemapPageData;
  const date = blogPost ? (blogPost.date ? new Date(blogPost.date) : undefined) : lastModified;

  return date instanceof Date && !isNaN(date.getTime()) ? date : undefined;
}

export function latestDate(dates: readonly (Date | undefined)[]): Date | undefined {
  return dates.reduce<Date | undefined>(
    (latest, date) => (date && (!latest || date > latest) ? date : latest),
    undefined,
  );
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
