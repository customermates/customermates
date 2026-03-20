import type { Metadata } from "next";

import { notFound } from "next/navigation";
import Link from "next/link";
import { CalendarIcon, ChevronLeftIcon } from "@heroicons/react/24/outline";
import { getLocale, getTranslations } from "next-intl/server";

import { BlogPostCard } from "../blog-post-card";

import { blogPostsSource } from "@/core/fumadocs/source";
import { Footer } from "@/app/components/footer";
import { XIcon } from "@/components/x-icon";
import { XChip } from "@/components/x-chip/x-chip";
import { generateMetadataFromMeta } from "@/core/fumadocs/metadata";
import { getMDXComponents } from "@/core/fumadocs/mdx-components";
import { XTOC } from "@/components/x-toc";
import { XImage } from "@/components/x-image";

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
  const locale = await getLocale();
  const t = await getTranslations("BlogPostPage");
  const page = blogPostsSource.getPage([slug], locale);

  if (!page) notFound();

  const MDX = page.data.body;
  const { hero, blogPost } = page.data;
  const { backToBlog, date, by, tags } = blogPost;
  const components = getMDXComponents();

  const allPosts = blogPostsSource.getPages(locale);
  const sortedPosts = [...allPosts]
    .sort((a, b) => {
      const dateA = new Date(a.data.blogPost.date).getTime();
      const dateB = new Date(b.data.blogPost.date).getTime();
      return dateB - dateA;
    })
    .filter((post) => post.url !== page.url)
    .slice(0, 3);

  return (
    <div className="flex flex-col items-center justify-center">
      <section className="pt-12 md:pt-16 pb-16 md:pb-24 w-full">
        <article className="max-w-6xl mx-auto px-4 flex-1">
          <Link className="inline-flex items-center text-subdued mb-8" href={`/${locale}/blog`}>
            <XIcon className="mr-2" icon={ChevronLeftIcon} size="sm" />

            {backToBlog}
          </Link>

          <header>
            <XImage
              isLocalized
              alt={hero.title}
              className="w-full mb-8 overflow-hidden rounded-4xl max-w-full! object-bottom max-h-108 object-cover z-0"
              height={1080}
              loading="eager"
              src={`${slug}.png`}
              width={1920}
            />

            <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 text-sm text-subdued pb-6">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                <time className="whitespace-nowrap flex items-center gap-2" dateTime={new Date(date).toISOString()}>
                  <XIcon icon={CalendarIcon} size="md" />

                  {new Date(date).toLocaleDateString(locale, {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </time>

                <span className="hidden sm:inline">•</span>

                <span className="whitespace-nowrap flex items-center gap-2">
                  <XImage
                    alt="Benjamin Wagner"
                    className="rounded-full shrink-0 min-w-4.5 min-h-4.5 w-4.5 h-4.5"
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
                      <XChip key={tag} color="primary">
                        {tag}
                      </XChip>
                    ))}
                  </div>
                </>
              )}
            </div>
          </header>

          <XTOC items={page.data.toc}>
            <div className="prose prose-sm prose-neutral dark:prose-invert max-w-none">
              <MDX components={components} />
            </div>
          </XTOC>
        </article>
      </section>

      {sortedPosts.length > 0 && (
        <section className="pb-16 md:pb-24 w-full">
          <div className="max-w-7xl mx-auto px-4">
            <h2 className="text-x-3xl mb-8">{t("relatedArticles")}</h2>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {sortedPosts.map((post) => (
                <div key={post.url} className="min-w-0">
                  <BlogPostCard {...post.data.blogPost} locale={locale} title={post.data.title} url={post.url} />
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <Footer />
    </div>
  );
}
