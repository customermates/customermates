"use client";

import { useEffect, useState } from "react";

import type { SceneName } from "./scene-names";

import { ChatDraftScene } from "@/components/marketing/scenes/chat-draft-scene";
import { DashboardScene } from "@/components/marketing/scenes/dashboard-scene";
import { PipelineScene } from "@/components/marketing/scenes/pipeline-scene";
import { AgentPipelineFilm } from "@/components/marketing/visuals/agent-pipeline-film";
import { DashboardInsightFilm } from "@/components/marketing/visuals/dashboard-insight-film";
import { UnifiedInboxFilm } from "@/components/marketing/visuals/unified-inbox-film";
import type { ContentLocale } from "@/i18n/locale-registry";
import { MOTION_STORYBOARDS } from "../components/motion-storyboards.data";

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

export function FrameDriver({ initial, locale, scene }: { initial: number; locale: ContentLocale; scene: SceneName }) {
  const [t, setT] = useState(initial);

  useEffect(() => {
    window.setSceneFrame = (next: number) => setT(next);
    window.sceneFrameReady = true;
    return () => {
      delete window.setSceneFrame;
      delete window.sceneFrameReady;
    };
  }, []);

  if (scene === "unified-inbox") return <UnifiedInboxFilm brief={MOTION_STORYBOARDS[0]} locale={locale} t={t} />;
  if (scene === "agent-pipeline") return <AgentPipelineFilm brief={MOTION_STORYBOARDS[1]} locale={locale} t={t} />;
  if (scene === "dashboard-insight")
    return <DashboardInsightFilm brief={MOTION_STORYBOARDS[2]} locale={locale} t={t} />;

  const Scene = SCENES[scene];
  return <Scene film t={t} />;
}
