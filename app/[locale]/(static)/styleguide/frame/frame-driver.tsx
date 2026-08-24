"use client";

import { useEffect, useState } from "react";

import { ChatDraftScene } from "@/components/marketing/scenes/chat-draft-scene";

declare global {
  interface Window {
    setSceneFrame?: (next: number) => void;
    sceneFrameReady?: boolean;
  }
}

export function FrameDriver({ initial }: { initial: number }) {
  const [t, setT] = useState(initial);

  useEffect(() => {
    window.setSceneFrame = (next: number) => setT(next);
    window.sceneFrameReady = true;
    return () => {
      delete window.setSceneFrame;
      delete window.sceneFrameReady;
    };
  }, []);

  return <ChatDraftScene t={t} />;
}
