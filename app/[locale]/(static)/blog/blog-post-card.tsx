"use client";

import type { BlogPost } from "@/core/fumadocs/schemas/blog-posts";

import { PostCard } from "@/components/marketing/post-card";
import { PostCardDate } from "@/components/marketing/post-card-date";
import { TagList } from "@/components/marketing/tag-list";
import { AppImage } from "@/components/shared/app-image";

type Props = BlogPost & {
  description?: string;
  locale: string;
  title: string;
  url: string;
};

function getImagePath(url: string): string {
  const urlParts = url.split("/").filter(Boolean);
  const slug = urlParts[urlParts.length - 1] || "";
  return `${slug}.png`;
}

export function BlogPostCard({ author, date, description, locale, tags, title, url }: Props) {
  const imagePath = getImagePath(url);

  return (
    <PostCard
      bottom={tags.length > 0 ? <TagList tags={tags} /> : null}
      description={description}
      href={url}
      imageSrc={imagePath}
      title={title}
      topLeft={
        <span className="flex min-w-0 shrink items-center gap-2">
          <AppImage
            alt="Benjamin Wagner"
            className="size-4.5 min-w-4.5 min-h-4.5 shrink-0 rounded-full"
            height={800}
            src="benjamin-wagner.png"
            width={800}
          />

          <span className="truncate">{author}</span>
        </span>
      }
      topRight={<PostCardDate date={String(date)} locale={locale} />}
    />
  );
}
