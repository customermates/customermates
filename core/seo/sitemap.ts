import type { MetadataRoute } from "next";
import type { MarketingLocale } from "@/i18n/locale-registry";

import { buildLocalePath } from "@/i18n/locale-registry";

import { buildAlternateLanguages } from "./alternates";

export type LocalizedRoute = {
  locale: MarketingLocale;
  routePath: string;
  lastModified?: Date;
};

type SitemapPageData = { blogPost?: { date?: Date | string; updated?: Date | string }; lastModified?: Date };

function validDate(value: Date | string | undefined): Date | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);

  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function resolvePageLastModified(data: object): Date | undefined {
  const { blogPost, lastModified } = data as SitemapPageData;

  if (!blogPost) return validDate(lastModified);

  const published = validDate(blogPost.date);
  if (!published) return undefined;

  return latestDate([published, validDate(blogPost.updated), validDate(lastModified)]);
}

export function latestDate(dates: readonly (Date | undefined)[]): Date | undefined {
  return dates.reduce<Date | undefined>(
    (latest, date) => (date && (!latest || date > latest) ? date : latest),
    undefined,
  );
}

export function assembleSitemap(localizedRoutes: readonly LocalizedRoute[], baseUrl: string): MetadataRoute.Sitemap {
  const localesByRoutePath = new Map<string, MarketingLocale[]>();

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
