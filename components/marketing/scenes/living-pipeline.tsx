"use client";

import { useRef } from "react";

import { PIPELINE_DURATION_MS, PipelineScene } from "./pipeline-scene";
import type { SceneProps } from "./scene-grammar";

import { useSceneClock } from "@/hooks/use-scene-clock";

export function LivingPipeline({ className, label }: SceneProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const t = useSceneClock(PIPELINE_DURATION_MS, hostRef);

  return (
    <div ref={hostRef}>
      <PipelineScene className={className} label={label} t={t ?? undefined} />
    </div>
  );
}
