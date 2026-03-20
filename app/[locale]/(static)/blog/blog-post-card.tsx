"use client";

import type { BlogPost } from "@/core/fumadocs/schemas/blog-posts";

import { CalendarIcon } from "@heroicons/react/24/outline";
import { Link } from "@heroui/link";

import { XCard } from "@/components/x-card/x-card";
import { XCardBody } from "@/components/x-card/x-card-body";
import { XChip } from "@/components/x-chip/x-chip";
import { XIcon } from "@/components/x-icon";
import { XImage } from "@/components/x-image";

type Props = BlogPost & {
  title: string;
  locale: string;
  url: string;
};

function getImagePath(url: string): string {
  const urlParts = url.split("/").filter(Boolean);
  const slug = urlParts[urlParts.length - 1] || "";
  return `${slug}.png`;
}

export function BlogPostCard({ url, title, date, author, tags, locale }: Props) {
  const imagePath = getImagePath(url);

  return (
    <Link className="block min-w-0 w-full" href={url}>
      <XCard isPressable className="overflow-hidden min-w-0 w-full">
        <XImage
          isLocalized
          alt={title}
          className="w-full h-56 object-cover object-bottom-left rounded-none"
          height={1080}
          src={imagePath}
          width={1920}
        />

        <XCardBody>
          <div className="flex items-center justify-between gap-2 text-sm text-subdued min-w-0">
            <span className="flex items-center gap-2 min-w-0 shrink">
              <XImage
                alt="Benjamin Wagner"
                className="rounded-full shrink-0 min-w-4.5 min-h-4.5 w-4.5 h-4.5"
                height={800}
                src="benjamin-wagner.png"
                width={800}
              />

              <span className="truncate">{author}</span>
            </span>

            <time className="flex items-center gap-2 shrink-0" dateTime={new Date(date).toISOString()}>
              <XIcon icon={CalendarIcon} size="md" />

              {new Date(date).toLocaleDateString(locale, {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </time>
          </div>

          {tags.length > 0 && (
            <div className="flex gap-2 min-w-0 overflow-hidden">
              {tags.map((tag, index) => (
                <XChip key={tag} className={index === tags.length - 1 ? "min-w-0 shrink" : "shrink-0"} color="primary">
                  {tag}
                </XChip>
              ))}
            </div>
          )}
        </XCardBody>
      </XCard>
    </Link>
  );
}
