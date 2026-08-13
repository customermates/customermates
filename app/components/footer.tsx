import { getLocale, getTranslations } from "next-intl/server";

import { FooterContent } from "./footer-content";
import { type FooterCollection, selectFooterSlugs } from "./footer-selection";

import { blogPostsSource, comparePagesSource, featurePagesSource, forPagesSource } from "@/core/fumadocs/source";
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

  return selectFooterSlugs(collection, [...bySlug.keys()]).flatMap((slug) => {
    const page = bySlug.get(slug);
    return page ? [{ page, slug }] : [];
  });
}

export async function Footer() {
  const locale = contentLocaleOrDefault(await getLocale());
  const t = await getTranslations("ComparePage");

  const competitors = selectPages("compare-pages", comparePagesSource.getPages(locale)).map(({ page, slug }) => {
    const competitor2 = page.data.comparison?.competitor2Name;
    let displayName = page.data.competitorName;
    if (slug.includes("-vs-") && competitor2) displayName = `${page.data.competitorName} vs ${competitor2}`;
    else if (slug.endsWith("-alternative")) {
      displayName = t("alternativeTitle", {
        competitor: page.data.competitorName,
      });
    }
    return { displayName, slug };
  });

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
    <FooterContent
      blogPosts={blogPosts}
      competitors={competitors}
      featureLinks={featureLinks}
      industries={industries}
    />
  );
}
