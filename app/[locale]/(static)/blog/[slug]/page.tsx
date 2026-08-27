import type { Metadata } from "next";

import { notFound } from "next/navigation";
import { Calendar, ChevronLeft } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { BlogPostCard } from "../blog-post-card";

import { IntlLink } from "@/i18n/navigation";
import { blogPostsSource } from "@/core/fumadocs/source";
import { ShowcaseFrame } from "@/components/marketing/showcase-frame";
import { Footer } from "@/app/components/footer";
import { Icon } from "@/components/shared/icon";
import { AppChip } from "@/components/chip/app-chip";
import { JsonLd } from "@/components/seo/json-ld";
import { generateMetadataFromMeta } from "@/core/fumadocs/metadata";
import { getMDXComponents } from "@/core/fumadocs/mdx-components";
import { ringOrder, selectRelatedSlugs } from "@/core/seo/related-selection";
import { Toc } from "@/components/shared/toc";
import { AppImage } from "@/components/shared/app-image";
import { articleSchema, breadcrumbListSchema } from "@/core/seo/schemas";
import { contentLocaleOrDefault, formattingTagFor } from "@/i18n/locale-registry";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;

  return generateMetadataFromMeta({
    locale,
    route: "/blog/:slug",
    params: { slug },
    type: "article",
  });
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const locale = contentLocaleOrDefault(await getLocale());
  const t = await getTranslations();
  const page = blogPostsSource.getPage([slug], locale);

  if (!page) notFound();

  const MDX = page.data.body;
  const { hero, blogPost } = page.data;
  const { backToBlog, date, by, tags } = blogPost;
  const components = getMDXComponents();

  const postEntries = blogPostsSource
    .getPages(locale)
    .map((post) => ({ post, slug: post.url?.split("/").pop() ?? "" }))
    .filter((entry) => entry.slug.length > 0);
  const postsBySlug = new Map(postEntries.map((entry) => [entry.slug, entry.post]));
  const ringSlugs = ringOrder(
    postEntries,
    (entry) => entry.post.data.blogPost.tags?.[0] ?? "",
    (entry) => entry.slug,
  ).map((entry) => entry.slug);
  const sortedPosts = selectRelatedSlugs(slug, ringSlugs)
    .map((related) => postsBySlug.get(related))
    .filter((post) => post !== undefined);

  return (
    <div className="relative flex flex-col items-center justify-center">
      <JsonLd
        schema={articleSchema({
          authorName: blogPost.author,
          datePublished: new Date(blogPost.date).toISOString(),
          dateModified: new Date(page.data.lastModified ?? blogPost.date).toISOString(),
          description: page.data.description,
          headline: page.data.title,
          locale,
          slug,
        })}
      />

      <JsonLd
        schema={breadcrumbListSchema([
          { name: t("StructuredData.breadcrumb.home"), path: `/${locale}` },
          { name: t("StructuredData.breadcrumb.blog"), path: `/${locale}/blog` },
          { name: hero.title, path: `/${locale}/blog/${slug}` },
        ])}
      />

      <section className="pt-12 md:pt-16 pb-16 md:pb-24 w-full">
        <article className="marketing-container flex-1">
          <IntlLink className="inline-flex items-center text-subdued mb-8" href="/blog">
            <Icon className="mr-2" icon={ChevronLeft} size="sm" />

            {backToBlog}
          </IntlLink>

          <header>
            <ShowcaseFrame className="mb-8">
              <AppImage
                isLocalized
                alt={hero.title}
                className="w-full h-auto rounded-none"
                height={1080}
                loading="eager"
                src={`${slug}.png`}
                width={1920}
              />
            </ShowcaseFrame>

            <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 text-sm text-subdued pb-6">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                <time className="whitespace-nowrap flex items-center gap-2" dateTime={new Date(date).toISOString()}>
                  <Icon icon={Calendar} size="md" />

                  {new Date(date).toLocaleDateString(formattingTagFor(locale), {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </time>

                <span className="hidden sm:inline">•</span>

                <span className="whitespace-nowrap flex items-center gap-2">
                  <AppImage
                    alt="Benjamin Wagner"
                    className="rounded-full shrink-0 min-w-4.5 min-h-4.5 size-4.5"
                    height={800}
                    src="benjamin-wagner.png"
                    width={800}
                  />

                  {by}
                </span>
              </div>

              {tags.length > 0 && (
                <>
                  <span className="hidden sm:inline">•</span>

                  <div className="flex flex-wrap gap-2">
                    {tags.map((tag: string) => (
                      <AppChip key={tag} variant="default">
                        {tag}
                      </AppChip>
                    ))}
                  </div>
                </>
              )}
            </div>
          </header>

          <Toc items={page.data.toc}>
            <div className="prose prose-sm prose-neutral dark:prose-invert max-w-none">
              <MDX components={components} />
            </div>
          </Toc>
        </article>
      </section>

      {sortedPosts.length > 0 && (
        <section className="pb-16 md:pb-24 w-full">
          <div className="marketing-container">
            <h2 className="text-display-sm mb-8">{t("BlogPostPage.relatedArticles")}</h2>

            <div className="grid auto-rows-fr grid-cols-1 gap-6 sm:grid-cols-2 md:gap-8 lg:grid-cols-3">
              {sortedPosts.map((post) => {
                const postSlug = post.url?.split("/").pop() ?? "";
                if (!postSlug) return null;

                return (
                  <div key={post.url} className="min-w-0">
                    <BlogPostCard
                      {...post.data.blogPost}
                      locale={locale}
                      title={post.data.title}
                      url={`/blog/${postSlug}`}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      <Footer />
    </div>
  );
}
