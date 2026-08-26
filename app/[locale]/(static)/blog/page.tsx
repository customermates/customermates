import type { Metadata } from "next";

import { getLocale, getTranslations } from "next-intl/server";
import { notFound, permanentRedirect } from "next/navigation";

import { BlogPostCard } from "./blog-post-card";

import { Footer } from "@/app/components/footer";
import { HubPagination } from "@/components/marketing/hub-pagination";
import { PostGridShell } from "@/components/marketing/post-grid-shell";
import { generateMetadataFromMeta } from "@/core/fumadocs/metadata";
import { blogPostsSource, blogSource } from "@/core/fumadocs/source";
import {
  HUB_PAGE_PARAM,
  hubPageCount,
  hubPageCountForSource,
  hubPageHref,
  hubPageOneRedirectHref,
  paginateLocalizedHubPages,
  resolveHubPage,
} from "@/core/seo/hub-pagination";
import { DEFAULT_LOCALE, buildLocalePath, contentLocaleOrDefault, formattingTagFor } from "@/i18n/locale-registry";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbListSchema } from "@/core/seo/schemas";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { locale } = await params;
  const query = await searchParams;
  const resolution = resolveHubPage(query[HUB_PAGE_PARAM], hubPageCountForSource(blogPostsSource));

  if (resolution.kind === "not-found") notFound();

  const t = await getTranslations({ locale });

  return generateMetadataFromMeta({
    canonicalPath: hubPageHref("/blog", resolution.page),
    locale,
    route: "/blog",
    descriptionSuffix: resolution.page > 1 ? t("Common.pageNumber", { page: resolution.page }) : undefined,
    titleSuffix: resolution.page > 1 ? t("Common.pageNumber", { page: resolution.page }) : undefined,
  });
}

export default async function BlogPage({ searchParams }: Props) {
  const locale = contentLocaleOrDefault(await getLocale());
  const page = blogSource.getPage(["blog"], locale);

  if (!page) notFound();

  const referencePosts = blogPostsSource.getPages(DEFAULT_LOCALE);
  const query = await searchParams;
  const resolution = resolveHubPage(query[HUB_PAGE_PARAM], hubPageCount(referencePosts.length));

  if (resolution.kind === "not-found") notFound();
  if (resolution.kind === "redirect-page-one")
    permanentRedirect(buildLocalePath(locale, hubPageOneRedirectHref("/blog", query)));

  const referenceCollator = new Intl.Collator(formattingTagFor(DEFAULT_LOCALE));
  const paginated = paginateLocalizedHubPages(
    referencePosts,
    blogPostsSource.getPages(locale),
    resolution.page,
    (a, b) => {
      const dateDifference =
        new Date(b.page.data.blogPost.date).getTime() - new Date(a.page.data.blogPost.date).getTime();
      return dateDifference || referenceCollator.compare(a.slug, b.slug);
    },
  );
  const t = await getTranslations("Common.table");
  const breadcrumb = await getTranslations("StructuredData.breadcrumb");

  return (
    <div className="flex flex-col items-center justify-center">
      <JsonLd
        schema={breadcrumbListSchema([
          { name: breadcrumb("home"), path: `/${locale}` },
          { name: breadcrumb("blog"), path: `/${locale}/blog` },
        ])}
      />

      <PostGridShell hero={page.data.hero}>
        {paginated.items.map(({ page: post, slug }) => (
          <div key={post.url} className="min-w-0">
            <BlogPostCard
              {...post.data.blogPost}
              description={post.data.description}
              locale={locale}
              title={post.data.title}
              url={`/blog/${slug}`}
            />
          </div>
        ))}
      </PostGridShell>

      <HubPagination
        basePath="/blog"
        label={page.data.title}
        nextLabel={t("nextPage")}
        page={paginated.page}
        pageCount={paginated.pageCount}
        previousLabel={t("previousPage")}
      />

      <Footer />
    </div>
  );
}
