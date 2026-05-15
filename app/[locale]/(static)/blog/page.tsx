import type { Metadata } from "next";

import { getLocale } from "next-intl/server";

import { BlogPostCard } from "./blog-post-card";

import { Footer } from "@/app/components/footer";
import { PostGridShell } from "@/components/marketing/post-grid-shell";
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
    <div className="flex flex-col items-center justify-center">
      <PostGridShell hero={page.data.hero}>
        {sortedPosts.map((post) => {
          const slug = post.url?.split("/").pop() ?? "";
          if (!slug) return null;

          return (
            <div key={post.url} className="min-w-0">
              <BlogPostCard
                {...post.data.blogPost}
                description={post.data.description}
                locale={locale}
                title={post.data.title}
                url={`/blog/${slug}`}
              />
            </div>
          );
        })}
      </PostGridShell>

      <Footer />
    </div>
  );
}
