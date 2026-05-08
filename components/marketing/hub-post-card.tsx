"use client";

import { AppChip } from "@/components/chip/app-chip";

import { PostCard } from "./post-card";
import { PostCardDate } from "./post-card-date";

export type HubPostCardProps = {
  date?: string;
  description: string;
  href: string;
  imageSrc?: string;
  locale: string;
  placeholderLabel?: string;
  tag?: string;
  title: string;
};

export function HubPostCard({
  date,
  description,
  href,
  imageSrc,
  locale,
  placeholderLabel,
  tag,
  title,
}: HubPostCardProps) {
  return (
    <PostCard
      description={description}
      href={href}
      imageSrc={imageSrc}
      placeholderLabel={imageSrc ? undefined : (placeholderLabel ?? title)}
      title={title}
      topLeft={
        tag ? (
          <AppChip className="shrink-0" variant="secondary">
            {tag}
          </AppChip>
        ) : null
      }
      topRight={date ? <PostCardDate date={date} locale={locale} /> : null}
    />
  );
}
