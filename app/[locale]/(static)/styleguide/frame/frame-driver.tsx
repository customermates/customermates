"use client";

import { useEffect, useState } from "react";

import type { SceneName } from "./scene-names";

import { ChatDraftScene } from "@/components/marketing/scenes/chat-draft-scene";
import { DashboardScene } from "@/components/marketing/scenes/dashboard-scene";
import { PipelineScene } from "@/components/marketing/scenes/pipeline-scene";

const SCENES = {
  "chat-draft": ChatDraftScene,
  dashboard: DashboardScene,
  pipeline: PipelineScene,
} as const;

declare global {
  interface Window {
    sceneFrameReady?: boolean;
    setSceneFrame?: (next: number) => void;
  }
}

export function FrameDriver({ initial, scene }: { initial: number; scene: SceneName }) {
  const [t, setT] = useState(initial);
  const Scene = SCENES[scene] ?? ChatDraftScene;

  useEffect(() => {
    window.setSceneFrame = (next: number) => setT(next);
    window.sceneFrameReady = true;
    return () => {
      delete window.setSceneFrame;
      delete window.sceneFrameReady;
    };
  }, []);

  return <Scene film t={t} />;
}
