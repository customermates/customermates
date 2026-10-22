import { getLocale } from "next-intl/server";

import { FooterContent } from "./footer-content";

import { env } from "@/env";
import { type FooterCollection, FOOTER_RENDERED_COLLECTION_SIZE, selectFooterSlugs } from "./footer-selection";

import { blogPostsSource, featurePagesSource, forPagesSource } from "@/core/fumadocs/source";
import { contentLocaleOrDefault, marketingLocaleOrDefault } from "@/i18n/locale-registry";

type SourcePage = {
  url: string;
};

function selectPages<T extends SourcePage>(
  collection: FooterCollection,
  pages: readonly T[],
): Array<{ page: T; slug: string }> {
  const bySlug = new Map<string, T>();

  for (const page of pages) {
    const slug = page.url.split("/").filter(Boolean).pop() ?? "";
    if (slug) bySlug.set(slug, page);
  }

  return selectFooterSlugs(collection, [...bySlug.keys()], FOOTER_RENDERED_COLLECTION_SIZE[collection]).flatMap(
    (slug) => {
      const page = bySlug.get(slug);
      return page ? [{ page, slug }] : [];
    },
  );
}

function pagesInLocale<T>(source: { getPages: (locale: string) => T[] }, locale: string, fallbackLocale: string): T[] {
  const pages = source.getPages(locale);
  return pages.length > 0 ? pages : source.getPages(fallbackLocale);
}

export async function Footer({ className }: { className?: string }) {
  const requestLocale = await getLocale();
  const locale = contentLocaleOrDefault(requestLocale);
  const pageLocale = marketingLocaleOrDefault(requestLocale);

  const industries = selectPages("for-pages", pagesInLocale(forPagesSource, pageLocale, locale)).map(
    ({ page, slug }) => ({
      displayName: page.data.industryName,
      slug,
    }),
  );

  const featureLinks = selectPages("feature-pages", pagesInLocale(featurePagesSource, pageLocale, locale)).map(
    ({ page, slug }) => ({
      displayName: page.data.featureName,
      slug,
    }),
  );

  const blogPosts = selectPages("blog-posts", blogPostsSource.getPages(locale)).map(({ page, slug }) => ({
    displayName: page.data.hero.title,
    slug,
  }));

  return (
    <FooterContent
      appMode={env.APP_MODE}
      blogPosts={blogPosts}
      className={className}
      featureLinks={featureLinks}
      industries={industries}
    />
  );
}
