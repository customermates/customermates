import type { Metadata } from "next";

import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { BlogPostCard } from "./blog-post-card";

import { Footer } from "@/app/components/footer";
import { CTASection } from "@/components/marketing/cta-section";
import { HubPagination } from "@/components/marketing/hub-pagination";
import { PostGridShell } from "@/components/marketing/post-grid-shell";
import { generateMetadataFromMeta } from "@/core/fumadocs/metadata";
import { blogPostsSource, blogSource } from "@/core/fumadocs/source";
import {
  hubPageCountForSource,
  hubPageHref,
  paginateLocalizedHubPages,
  resolveHubPageSegment,
} from "@/core/seo/hub-pagination";
import { DEFAULT_LOCALE, contentLocaleOrDefault, formattingTagFor } from "@/i18n/locale-registry";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbListSchema } from "@/core/seo/schemas";

export function blogHubPageCount(): number {
  return hubPageCountForSource(blogPostsSource);
}

export function blogHubPageFromSegment(raw: string): number {
  const resolution = resolveHubPageSegment(raw, blogHubPageCount());

  if (resolution.kind === "not-found") notFound();

  return resolution.page;
}

export async function generateBlogHubMetadata(locale: string, pageNumber: number): Promise<Metadata> {
  const t = await getTranslations({ locale });

  return generateMetadataFromMeta({
    canonicalPath: hubPageHref("/blog", pageNumber),
    locale,
    route: "/blog",
    descriptionSuffix: pageNumber > 1 ? t("Common.pageNumber", { page: pageNumber }) : undefined,
    titleSuffix: pageNumber > 1 ? t("Common.pageNumber", { page: pageNumber }) : undefined,
  });
}

export async function renderBlogHub(rawLocale: string, pageNumber: number) {
  const locale = contentLocaleOrDefault(rawLocale);
  const page = blogSource.getPage(["blog"], locale);

  if (!page) notFound();

  const referencePosts = blogPostsSource.getPages(DEFAULT_LOCALE);
  const referenceCollator = new Intl.Collator(formattingTagFor(DEFAULT_LOCALE));
  const paginated = paginateLocalizedHubPages(referencePosts, blogPostsSource.getPages(locale), pageNumber, (a, b) => {
    const dateDifference =
      new Date(b.page.data.blogPost.date).getTime() - new Date(a.page.data.blogPost.date).getTime();
    return dateDifference || referenceCollator.compare(a.slug, b.slug);
  });
  const t = await getTranslations("Common.table");
  const common = await getTranslations("Common");
  const breadcrumb = await getTranslations("StructuredData.breadcrumb");

  return (
    <div className="flex flex-col items-center justify-center">
      <JsonLd
        schema={breadcrumbListSchema([
          { name: breadcrumb("home"), path: `/${locale}` },
          { name: breadcrumb("blog"), path: `/${locale}/blog` },
        ])}
      />

      <PostGridShell
        hero={{
          ...page.data.hero,
          title:
            pageNumber > 1
              ? `${page.data.hero.title} - ${common("pageNumber", { page: pageNumber })}`
              : page.data.hero.title,
        }}
      >
        {paginated.items.map(({ page: post, slug }, index) => {
          const featured = paginated.page === 1 && index === 0;

          return (
            <div key={post.url} className={featured ? "min-w-0 sm:col-span-2 lg:col-span-2" : "min-w-0"}>
              <BlogPostCard
                {...post.data.blogPost}
                description={post.data.description}
                featured={featured}
                locale={locale}
                title={post.data.title}
                url={`/blog/${slug}`}
              />
            </div>
          );
        })}
      </PostGridShell>

      <HubPagination
        basePath="/blog"
        label={page.data.title}
        nextLabel={t("nextPage")}
        page={paginated.page}
        pageCount={paginated.pageCount}
        previousLabel={t("previousPage")}
      />

      <CTASection {...page.data.cta} />

      <Footer />
    </div>
  );
}
