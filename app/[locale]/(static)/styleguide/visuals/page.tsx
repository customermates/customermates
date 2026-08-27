import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { StyleguideChapter } from "../components/styleguide-chapter";
import { VisualsChapter } from "../components/visuals-chapter";

import { isContentLocale } from "@/i18n/locale-registry";

export const metadata: Metadata = {
  title: "Marketing visuals",
};

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function VisualsPage({ params }: Props) {
  const { locale } = await params;
  if (!isContentLocale(locale)) notFound();

  return (
    <StyleguideChapter chapter="visuals">
      <VisualsChapter locale={locale} />
    </StyleguideChapter>
  );
}
