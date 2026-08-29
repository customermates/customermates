import type { Metadata } from "next";

import { notFound } from "next/navigation";
import { Calendar, ChevronLeft } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { IntlLink } from "@/i18n/navigation";
import { blogPostsSource, blogSource } from "@/core/fumadocs/source";
import { Footer } from "@/app/components/footer";
import { LandingArticle } from "@/components/marketing/landing-article";
import { MarketingContainer } from "@/components/marketing/marketing-container";
import { PageEnding } from "@/components/marketing/page-ending";
import { Icon } from "@/components/shared/icon";
import { GridPattern } from "@/components/shared/grid-pattern";
import { AppChip } from "@/components/chip/app-chip";
import { JsonLd } from "@/components/seo/json-ld";
import { generateMetadataFromMeta } from "@/core/fumadocs/metadata";
import { getMDXComponents } from "@/core/fumadocs/mdx-components";
import { ringOrder, selectRelatedSlugs } from "@/core/seo/related-selection";
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
  const [{ slug }, rawLocale, t] = await Promise.all([params, getLocale(), getTranslations()]);
  const locale = contentLocaleOrDefault(rawLocale);
  const page = blogPostsSource.getPage([slug], locale);
  const blog = blogSource.getPage(["blog"], locale);

  if (!page || !blog) notFound();

  const MDX = page.data.body;
  const { hero, blogPost } = page.data;
  const { backToBlog, date, by, tags } = blogPost;
  const components = getMDXComponents({
    h1: ({ children, id }) => (
      <span aria-hidden="true" className="sr-only" id={id}>
        {children}
      </span>
    ),
  });
  const postEntries = blogPostsSource
    .getPages(locale)
    .map((post) => ({ post, slug: post.url?.split("/").pop() ?? "" }))
    .filter((entry) => entry.slug.length > 0);
  const ringSlugs = ringOrder(
    postEntries,
    (entry) => entry.post.data.blogPost.tags?.[0] ?? "",
    (entry) => entry.slug,
  ).map((entry) => entry.slug);
  const relatedHrefs = selectRelatedSlugs(slug, ringSlugs).map((related) => `/blog/${related}`);

  return (
    <div className="relative flex flex-col items-center justify-center" data-marketing-flow="continuous">
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
          {
            name: t("StructuredData.breadcrumb.blog"),
            path: `/${locale}/blog`,
          },
          { name: hero.title, path: `/${locale}/blog/${slug}` },
        ])}
      />

      <section className="relative isolate w-full overflow-hidden border-b border-border bg-background">
        <GridPattern className="z-0" fade="bottom" />

        <MarketingContainer className="relative z-10">
          <header className="py-14 sm:py-18 lg:py-24">
            <IntlLink className="text-meta inline-flex items-center hover:text-foreground" href="/blog">
              <Icon className="mr-2" icon={ChevronLeft} size="sm" />

              {backToBlog}
            </IntlLink>

            <div className="mt-8 max-w-5xl">
              <div>
                <h1 className="text-display m-0">{hero.title}</h1>

                <p className="text-lede mt-6">{hero.description}</p>

                <div className="mt-7 flex flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:gap-4">
                  <time className="flex items-center gap-2 whitespace-nowrap" dateTime={new Date(date).toISOString()}>
                    <Icon icon={Calendar} size="md" />

                    {new Date(date).toLocaleDateString(formattingTagFor(locale), {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </time>

                  <span aria-hidden className="hidden sm:inline">
                    •
                  </span>

                  <span className="flex items-center gap-2 whitespace-nowrap">
                    <AppImage
                      alt="Benjamin Wagner"
                      className="size-4.5 min-h-4.5 min-w-4.5 shrink-0 rounded-full"
                      height={800}
                      src="benjamin-wagner.png"
                      width={800}
                    />

                    {by}
                  </span>
                </div>

                {tags.length > 0 ? (
                  <div className="mt-5 flex flex-wrap gap-2">
                    {tags.map((tag: string) => (
                      <AppChip key={tag} variant="secondary">
                        {tag}
                      </AppChip>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </header>
        </MarketingContainer>
      </section>

      <LandingArticle founderContact items={page.data.toc}>
        <MDX components={components} />
      </LandingArticle>

      <PageEnding
        cta={page.data.acquisition?.cta ?? blog.data.cta}
        relatedHrefs={page.data.acquisition?.relatedHrefs ?? relatedHrefs}
      />

      <Footer />
    </div>
  );
}
