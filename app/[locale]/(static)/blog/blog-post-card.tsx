import type { BlogPost } from "@/core/fumadocs/schemas/blog-posts";
import type { ContentLocale } from "@/i18n/locale-registry";

import { PostCard } from "@/components/marketing/post-card";
import { PostCardDate } from "@/components/marketing/post-card-date";
import { TagList } from "@/components/marketing/tag-list";

type Props = BlogPost & {
  description?: string;
  featured?: boolean;
  locale: ContentLocale;
  title: string;
  url: string;
};

export function BlogPostCard({ author, date, description, featured, locale, tags, title, url }: Props) {
  return (
    <PostCard
      bottom={tags.length > 0 ? <TagList tags={tags} /> : null}
      description={description}
      featured={featured}
      href={url}
      title={title}
      topLeft={<span className="truncate">{author}</span>}
      topRight={<PostCardDate date={String(date)} locale={locale} />}
    />
  );
}
