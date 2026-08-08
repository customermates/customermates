import { makeObservable, observable, action } from "mobx";

import type { RootStore } from "@/core/stores/root.store";

import { BaseStore } from "@/core/base/base.store";
import { findAgentNavigationTarget } from "@/features/agent-chat/ui-targets";
import { agentGuidedTour, type AgentGuidedTourStep, type AgentTourId } from "@/features/agent-chat/agent-tours";

const COLLAPSED_NAV_GROUP_PATTERN = /^nav-(profile|company)-/;

export type Spotlight = {
  targetId: string;
  note: string | null;
  stepIndex: number;
  totalSteps: number;
};

export type AgentNavigationOutcome = "navigated" | "blocked" | "timeout";

function revealAncestor(targetId: string) {
  const match = COLLAPSED_NAV_GROUP_PATTERN.exec(targetId);
  if (!match) return;

  document.getElementById(`nav-${match[1]}`)?.click();
}

export function findAgentTargetElement(targetId: string) {
  const direct = document.getElementById(targetId);
  if (direct) return direct;

  revealAncestor(targetId);
  return document.getElementById(targetId);
}

export class AgentUiControlStore extends BaseStore {
  active: Spotlight | null = null;
  isTourPaused = false;
  private tourSteps: AgentGuidedTourStep[] = [];
  private navigateCallback: ((path: string) => Promise<AgentNavigationOutcome>) | null = null;
  private clearTimer: ReturnType<typeof setTimeout> | null = null;
  private previousFocus: HTMLElement | null = null;
  private tourRunVersion = 0;

  constructor(rootStore: RootStore) {
    super(rootStore);
    makeObservable(this, {
      active: observable.ref,
      isTourPaused: observable,
      showStep: action,
      previousStep: action,
      pause: action,
      resume: action,
      end: action,
    });
  }

  registerNavigate = (callback: ((path: string) => Promise<AgentNavigationOutcome>) | null) => {
    this.navigateCallback = callback;
  };

  navigate = async (targetId: string) => {
    const target = findAgentNavigationTarget(targetId);
    if (!target) {
      return {
        ok: false,
        result: `Navigation target ${targetId} is not allowed.`,
      };
    }
    if (!this.navigateCallback) return { ok: false, result: "Navigation is not available right now." };

    const outcome = await this.navigateCallback(target.route);
    if (outcome === "navigated") return { ok: true, result: `Navigated to ${target.route}.` };
    if (outcome === "blocked") {
      return {
        ok: false,
        result: "Navigation requires the user to resolve unsaved changes.",
      };
    }
    return {
      ok: false,
      result: `Navigation to ${target.route} did not finish.`,
    };
  };

  highlight = (targetId: string) => {
    const element = findAgentTargetElement(targetId);
    if (!element) {
      return {
        ok: false,
        result: `Target ${targetId} is not on the current page. Navigate first.`,
      };
    }

    this.tourRunVersion += 1;
    this.tourSteps = [];
    this.showStep({ targetId, note: null, stepIndex: 0, totalSteps: 1 });
    this.scheduleClear(8000);
    element.scrollIntoView({ block: "center", behavior: "smooth" });
    return { ok: true, result: `Highlighted ${targetId}.` };
  };

  startGuidedTour = async (tourId: AgentTourId | undefined, locale: string) => {
    if (!tourId) return { ok: false, result: "The requested tour is not available." };
    this.tourSteps = agentGuidedTour(tourId, locale);
    this.isTourPaused = false;
    this.captureFocus();
    const runVersion = ++this.tourRunVersion;
    const shown = await this.showTourStep(0, runVersion, 1);
    return shown
      ? { ok: true, result: `Started the ${tourId} guided tour.` }
      : {
          ok: false,
          result: `The ${tourId} guided tour has no available steps right now.`,
        };
  };

  nextStep = () => {
    if (!this.active || this.isTourPaused) return;

    const next = this.active.stepIndex + 1;
    if (next >= this.tourSteps.length) this.end();
    else this.requestTourStep(next, 1);
  };

  previousStep = () => {
    if (!this.active || this.isTourPaused) return;
    this.requestTourStep(Math.max(0, this.active.stepIndex - 1), -1);
  };

  pause = () => {
    if (!this.active?.note) return;
    this.isTourPaused = true;
    this.tourRunVersion += 1;
  };

  resume = () => {
    if (!this.active || !this.isTourPaused) return;
    this.isTourPaused = false;
    this.requestTourStep(this.active.stepIndex, 1);
  };

  end = () => {
    this.tourRunVersion += 1;
    this.active = null;
    this.tourSteps = [];
    this.isTourPaused = false;
    if (this.clearTimer) clearTimeout(this.clearTimer);
    this.previousFocus?.focus({ preventScroll: true });
    this.previousFocus = null;
  };

  showStep = (spotlight: Spotlight) => {
    if (this.clearTimer) clearTimeout(this.clearTimer);
    this.active = spotlight;
  };

  private requestTourStep(index: number, direction: 1 | -1) {
    const runVersion = ++this.tourRunVersion;
    void this.showTourStep(index, runVersion, direction);
  }

  private async showTourStep(index: number, runVersion: number, direction: 1 | -1): Promise<boolean> {
    if (runVersion !== this.tourRunVersion) return false;
    const step = this.tourSteps[index];
    if (!step) return false;

    if (step.route && this.navigateCallback) {
      const outcome = await this.navigateCallback(step.route);
      if (runVersion !== this.tourRunVersion) return false;
      if (outcome !== "navigated") {
        const next = index + direction;
        if (next < 0 || next >= this.tourSteps.length) {
          if (direction === 1) this.end();
          return false;
        }
        return this.showTourStep(next, runVersion, direction);
      }
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      if (runVersion !== this.tourRunVersion) return false;
    }

    const element = findAgentTargetElement(step.targetId);
    if (!element) {
      const next = index + direction;
      if (next < 0 || next >= this.tourSteps.length) {
        if (direction === 1) this.end();
        return false;
      }
      return this.showTourStep(next, runVersion, direction);
    }

    element.scrollIntoView({
      block: "center",
      behavior: "smooth",
    });
    this.showStep({
      targetId: step.targetId,
      note: step.note,
      stepIndex: index,
      totalSteps: this.tourSteps.length,
    });
    return true;
  }

  private captureFocus() {
    this.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }

  private scheduleClear(ms: number) {
    if (this.clearTimer) clearTimeout(this.clearTimer);
    this.clearTimer = setTimeout(() => {
      this.end();
    }, ms);
  }
}
