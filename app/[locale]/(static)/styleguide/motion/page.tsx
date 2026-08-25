import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { MotionStoryboards } from "../components/motion-storyboards";
import { StyleguideChapter } from "../components/styleguide-chapter";

import { isContentLocale } from "@/i18n/locale-registry";

export const metadata: Metadata = {
  title: "Marketing motion",
};

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function MotionPage({ params }: Props) {
  const { locale } = await params;
  if (!isContentLocale(locale)) notFound();

  return (
    <StyleguideChapter chapter="motion">
      <MotionStoryboards locale={locale} />
    </StyleguideChapter>
  );
}
