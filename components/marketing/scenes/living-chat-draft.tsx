"use client";

import { useRef } from "react";

import { CHAT_DRAFT_DURATION_MS, ChatDraftScene } from "./chat-draft-scene";
import type { SceneProps } from "./scene-grammar";

import { useSceneClock } from "@/hooks/use-scene-clock";

export function LivingChatDraft({ className, label }: SceneProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const t = useSceneClock(CHAT_DRAFT_DURATION_MS, hostRef);

  return (
    <div ref={hostRef}>
      <ChatDraftScene className={className} label={label} t={t ?? undefined} />
    </div>
  );
}
