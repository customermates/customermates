"use client";

import type { BlogPost } from "@/core/fumadocs/schemas/blog-posts";

import { Calendar } from "lucide-react";

import { AppLink } from "@/components/shared/app-link";
import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppChip } from "@/components/chip/app-chip";
import { Icon } from "@/components/shared/icon";
import { AppImage } from "@/components/shared/app-image";

type Props = BlogPost & {
  description?: string;
  title: string;
  locale: string;
  url: string;
};

function getImagePath(url: string): string {
  const urlParts = url.split("/").filter(Boolean);
  const slug = urlParts[urlParts.length - 1] || "";
  return `${slug}.png`;
}

export function BlogPostCard({ url, title, description, date, author, tags, locale }: Props) {
  const imagePath = getImagePath(url);

  return (
    <AppLink className="interactive-surface block min-w-0 w-full text-foreground" href={url}>
      <AppCard className="overflow-hidden min-w-0 w-full">
        <AppImage
          isLocalized
          alt={title}
          className="w-full h-56 object-cover object-bottom-left rounded-none"
          height={1080}
          src={imagePath}
          width={1920}
        />

        <AppCardBody>
          <div className="flex items-center justify-between gap-2 text-sm text-subdued min-w-0">
            <span className="flex items-center gap-2 min-w-0 shrink">
              <AppImage
                alt="Benjamin Wagner"
                className="rounded-full shrink-0 min-w-4.5 min-h-4.5 size-4.5"
                height={800}
                src="benjamin-wagner.png"
                width={800}
              />

              <span className="truncate">{author}</span>
            </span>

            <time className="flex items-center gap-2 shrink-0" dateTime={new Date(date).toISOString()}>
              <Icon icon={Calendar} size="md" />

              {new Date(date).toLocaleDateString(locale, {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </time>
          </div>

          {description && <p className="text-sm text-subdued line-clamp-2">{description}</p>}

          {tags.length > 0 && (
            <div className="flex gap-2 min-w-0 overflow-hidden">
              {tags.map((tag, index) => (
                <AppChip
                  key={tag}
                  className={index === tags.length - 1 ? "min-w-0 shrink" : "shrink-0"}
                  variant="default"
                >
                  {tag}
                </AppChip>
              ))}
            </div>
          )}
        </AppCardBody>
      </AppCard>
    </AppLink>
  );
}
