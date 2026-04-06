import type { Metadata } from "next";

import { getLocale } from "next-intl/server";

import { BlogPostCard } from "./blog-post-card";

import { Footer } from "@/app/components/footer";
import { PageHero } from "@/components/page-hero";
import { generateMetadataFromMeta } from "@/core/fumadocs/metadata";
import { blogPostsSource, blogSource } from "@/core/fumadocs/source";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return generateMetadataFromMeta({ locale, route: "/blog" });
}

export default async function BlogPage() {
  const locale = await getLocale();
  const page = blogSource.getPage(["blog"], locale);
  const posts = blogPostsSource.getPages(locale);

  if (!page) return null;

  const sortedPosts = [...posts].sort((a, b) => {
    const dateA = new Date(a.data.blogPost.date).getTime();
    const dateB = new Date(b.data.blogPost.date).getTime();
    return dateB - dateA;
  });

  return (
    <div className="flex flex-col items-center justify-center pt-16 md:pt-24">
      <PageHero {...page.data.hero} />

      <section className="pb-16 md:pb-24 w-full">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sortedPosts.map((post) => (
              <div key={post.url} className="min-w-0">
                <BlogPostCard
                  {...post.data.blogPost}
                  description={post.data.description}
                  locale={locale}
                  title={post.data.title}
                  url={post.url}
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
