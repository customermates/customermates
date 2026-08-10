"use client";

import { Calendar } from "lucide-react";

import { Icon } from "@/components/shared/icon";
import { formattingTagFor, type ContentLocale } from "@/i18n/locale-registry";

type Props = {
  date: string;
  locale: ContentLocale;
};

export function PostCardDate({ date, locale }: Props) {
  const iso = new Date(date).toISOString();
  const formatted = new Date(date).toLocaleDateString(formattingTagFor(locale), {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <time className="flex shrink-0 items-center gap-2" dateTime={iso}>
      <Icon icon={Calendar} size="md" />

      {formatted}
    </time>
  );
}
