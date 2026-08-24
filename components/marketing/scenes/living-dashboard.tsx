"use client";

import { useRef } from "react";

import { DASHBOARD_DURATION_MS, DashboardScene } from "./dashboard-scene";
import type { SceneProps } from "./scene-grammar";

import { useSceneClock } from "@/hooks/use-scene-clock";

export function LivingDashboard({ className, label }: SceneProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const t = useSceneClock(DASHBOARD_DURATION_MS, hostRef);

  return (
    <div ref={hostRef}>
      <DashboardScene className={className} label={label} t={t ?? undefined} />
    </div>
  );
}
