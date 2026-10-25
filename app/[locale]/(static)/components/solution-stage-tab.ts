import type { HomepageStageTab } from "@/core/fumadocs/schemas/homepage";
import type { SolutionCaptureTheme } from "@/core/solutions/solution-captures";
import type { SolutionStageTabId } from "@/core/solutions/solution-catalog";
import type { HomepageStageArea } from "./homepage-stage-areas";

export type SolutionStageImage = { height: number; src: string; width: number };

export type SolutionStageTab = {
  alt: string;
  area?: HomepageStageArea;
  caption: string;
  demoPath: string;
  icon: SolutionStageTabId;
  id: string;
  kind: "solution";
  label: string;
  poster: Record<SolutionCaptureTheme, SolutionStageImage>;
};

export type ProductStageTab = HomepageStageTab | SolutionStageTab;

export function isSolutionStageTab(tab: ProductStageTab): tab is SolutionStageTab {
  return "kind" in tab && tab.kind === "solution";
}
