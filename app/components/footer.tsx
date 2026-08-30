import { getLocale } from "next-intl/server";

import { FooterContent } from "./footer-content";
import { type FooterCollection, FOOTER_RENDERED_COLLECTION_SIZE, selectFooterSlugs } from "./footer-selection";

import { blogPostsSource, featurePagesSource, forPagesSource } from "@/core/fumadocs/source";
import { contentLocaleOrDefault } from "@/i18n/locale-registry";

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

export async function Footer({ className }: { className?: string }) {
  const locale = contentLocaleOrDefault(await getLocale());

  const industries = selectPages("for-pages", forPagesSource.getPages(locale)).map(({ page, slug }) => ({
    displayName: page.data.industryName,
    slug,
  }));

  const featureLinks = selectPages("feature-pages", featurePagesSource.getPages(locale)).map(({ page, slug }) => ({
    displayName: page.data.featureName,
    slug,
  }));

  const blogPosts = selectPages("blog-posts", blogPostsSource.getPages(locale)).map(({ page, slug }) => ({
    displayName: page.data.hero.title,
    slug,
  }));

  return (
    <FooterContent blogPosts={blogPosts} className={className} featureLinks={featureLinks} industries={industries} />
  );
}
