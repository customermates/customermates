import type { Metadata } from "next";

import { SectionPatterns } from "../components/section-patterns";
import { StyleguideChapter } from "../components/styleguide-chapter";
import { enableStaticLocale, type StaticLocaleProps } from "@/i18n/static-locale";

export const metadata: Metadata = {
  title: "Marketing section patterns",
};

export default async function PatternsPage({ params }: StaticLocaleProps) {
  await enableStaticLocale(params);

  return (
    <StyleguideChapter chapter="patterns">
      <SectionPatterns />
    </StyleguideChapter>
  );
}
