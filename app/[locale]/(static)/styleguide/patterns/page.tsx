import type { Metadata } from "next";

import { SectionPatterns } from "../components/section-patterns";
import { StyleguideChapter } from "../components/styleguide-chapter";

export const metadata: Metadata = {
  title: "Marketing section patterns",
};

export default function PatternsPage() {
  return (
    <StyleguideChapter chapter="patterns">
      <SectionPatterns />
    </StyleguideChapter>
  );
}
