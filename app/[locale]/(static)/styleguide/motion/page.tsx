import type { Metadata } from "next";

import { MotionStoryboards } from "../components/motion-storyboards";
import { StyleguideChapter } from "../components/styleguide-chapter";

export const metadata: Metadata = {
  title: "Marketing motion",
};

export default function MotionPage() {
  return (
    <StyleguideChapter chapter="motion">
      <MotionStoryboards />
    </StyleguideChapter>
  );
}
