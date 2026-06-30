import type { TourStep } from "../ui-tools";

import { makeAutoObservable } from "mobx";

import { findAgentTargetElement } from "../ui-targets";

export type ActiveSpotlight = {
  targetId: string;
  title?: string;
  body?: string;
  stepIndex?: number;
  stepCount?: number;
};

/**
 * Drives the on-page spotlight/tour overlay. The agent's client UI tools call
 * highlight()/startTour()/scrollTo(); the overlay component observes `active`.
 */
export class AgentUiControlStore {
  mode: "none" | "highlight" | "tour" = "none";
  single: { targetId: string; message?: string } | null = null;
  tourSteps: TourStep[] = [];
  tourIndex = 0;

  constructor() {
    makeAutoObservable(this);
  }

  get active(): ActiveSpotlight | null {
    if (this.mode === "tour") {
      const step = this.tourSteps[this.tourIndex];
      if (!step) return null;
      return {
        targetId: step.targetId,
        title: step.title,
        body: step.body,
        stepIndex: this.tourIndex,
        stepCount: this.tourSteps.length,
      };
    }
    if (this.mode === "highlight" && this.single) return { targetId: this.single.targetId, body: this.single.message };

    return null;
  }

  highlight = (targetId: string, message?: string) => {
    this.mode = "highlight";
    this.single = { targetId, message };
    this.tourSteps = [];
    this.tourIndex = 0;
  };

  startTour = (steps: TourStep[]) => {
    this.mode = "tour";
    this.tourSteps = steps;
    this.tourIndex = 0;
    this.single = null;
  };

  next = () => {
    if (this.tourIndex < this.tourSteps.length - 1) this.tourIndex += 1;
    else this.end();
  };

  prev = () => {
    if (this.tourIndex > 0) this.tourIndex -= 1;
  };

  end = () => {
    this.mode = "none";
    this.single = null;
    this.tourSteps = [];
    this.tourIndex = 0;
  };

  scrollTo = (targetId: string): boolean => {
    const el = findAgentTargetElement(targetId);
    if (!el) return false;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    return true;
  };
}
