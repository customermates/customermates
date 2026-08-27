import { makeObservable, observable, action } from "mobx";

import type { RootStore } from "@/core/stores/root.store";
import type { OpenRecordData } from "@/ee/agent-chat/ui-operations";

import { BaseStore } from "@/core/base/base.store";
import { ENTITY_URL_SEGMENT } from "@/components/entity-detail/entity-relations";
import { EntityType } from "@/generated/prisma";
import { findAgentClickTarget, findAgentNavigationTarget, type AgentUiClickTarget } from "@/ee/agent-chat/ui-targets";
import { agentGuidedTour, type AgentGuidedTourStep, type AgentTourStepData } from "@/ee/agent-chat/agent-tours";
import {
  captureOverlayFocusTarget,
  focusOverlayTarget,
  type OverlayFocusTarget,
} from "@/components/ui/overlay-focus-target";

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

const TARGET_SETTLE_TIMEOUT_MS = 2000;
const TARGET_SETTLE_POLL_MS = 100;

async function awaitAgentTargetElement(targetId: string, stillCurrent: () => boolean) {
  const deadline = Date.now() + TARGET_SETTLE_TIMEOUT_MS;
  for (;;) {
    const element = findAgentTargetElement(targetId);
    if (element || Date.now() >= deadline || !stillCurrent()) return element;
    await new Promise<void>((resolve) => setTimeout(resolve, TARGET_SETTLE_POLL_MS));
  }
}

const TARGET_ACTIVATION_TIMEOUT_MS = 1000;
const TARGET_ACTIVATION_POLL_MS = 25;

function isElementVisible(element: HTMLElement) {
  if (!element.isConnected || element.hidden || element.getAttribute("aria-hidden") === "true") return false;
  if (element.closest("[hidden], [aria-hidden='true'], [inert]")) return false;

  const style = window.getComputedStyle(element);
  return (
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    style.opacity !== "0" &&
    style.pointerEvents !== "none" &&
    element.getClientRects().length > 0
  );
}

function isTargetActive(target: AgentUiClickTarget, element: HTMLElement) {
  if (target.activation.kind === "expanded") return element.getAttribute("aria-expanded") === "true";
  return element.getAttribute("data-state") === "active";
}

async function awaitTargetActivation(target: AgentUiClickTarget) {
  const deadline = Date.now() + TARGET_ACTIVATION_TIMEOUT_MS;
  for (;;) {
    const element = document.getElementById(target.id);
    if (element && isTargetActive(target, element)) return true;
    if (Date.now() >= deadline) return false;
    await new Promise<void>((resolve) => setTimeout(resolve, TARGET_ACTIVATION_POLL_MS));
  }
}

export class AgentUiControlStore extends BaseStore {
  active: Spotlight | null = null;
  private tourSteps: AgentGuidedTourStep[] = [];
  private navigateCallback: ((path: string) => Promise<AgentNavigationOutcome>) | null = null;
  private clearTimer: ReturnType<typeof setTimeout> | null = null;
  private previousFocus: OverlayFocusTarget | null = null;
  private tourRunVersion = 0;

  constructor(rootStore: RootStore) {
    super(rootStore);
    makeObservable(this, {
      active: observable.ref,
      showStep: action,
      previousStep: action,
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

  startGuidedTour = async (steps: readonly AgentTourStepData[] | undefined) => {
    if (!steps?.length) return { ok: false, result: "The tour had no usable steps." };
    this.tourSteps = agentGuidedTour(steps);
    if (!this.tourSteps.length) {
      return {
        ok: false,
        result: "None of the tour targets exist in this interface.",
      };
    }

    this.captureFocus();
    const runVersion = ++this.tourRunVersion;
    const shown = await this.showTourStep(0, runVersion, 1, true);
    return shown
      ? {
          ok: true,
          result: `Started a ${this.tourSteps.length}-step guided tour.`,
        }
      : {
          ok: false,
          result: "None of the tour targets are reachable right now.",
        };
  };

  nextStep = () => {
    if (!this.active) return;

    const next = this.active.stepIndex + 1;
    if (next >= this.tourSteps.length) this.end();
    else this.requestTourStep(next, 1);
  };

  previousStep = () => {
    if (!this.active) return;
    this.requestTourStep(Math.max(0, this.active.stepIndex - 1), -1);
  };

  end = () => {
    this.tourRunVersion += 1;
    this.active = null;
    this.tourSteps = [];
    if (this.clearTimer) clearTimeout(this.clearTimer);
    focusOverlayTarget(this.previousFocus);
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

  private async showTourStep(index: number, runVersion: number, direction: 1 | -1, settle = false): Promise<boolean> {
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

    const element = settle
      ? await awaitAgentTargetElement(step.targetId, () => runVersion === this.tourRunVersion)
      : findAgentTargetElement(step.targetId);
    if (runVersion !== this.tourRunVersion) return false;
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

  clickTarget = async (targetId: string) => {
    const target = findAgentClickTarget(targetId);
    if (!target) {
      return {
        ok: false,
        result: `Target ${targetId} is not an allowed interface control.`,
      };
    }

    const element = document.getElementById(targetId);
    if (!element) {
      const prerequisite = target.activation.kind === "selected" ? target.activation.prerequisite : null;
      return {
        ok: false,
        result: prerequisite
          ? `Target ${targetId} is not available. Open ${prerequisite} first.`
          : `Target ${targetId} is not on the current page. Navigate first.`,
      };
    }
    if (element.tagName !== "BUTTON") {
      return {
        ok: false,
        result: `Target ${targetId} is not an activatable button.`,
      };
    }
    if (!isElementVisible(element)) return { ok: false, result: `Target ${targetId} is not visible.` };
    if ((element as HTMLButtonElement).disabled || element.getAttribute("aria-disabled") === "true")
      return { ok: false, result: `Target ${targetId} is disabled.` };
    if (isTargetActive(target, element)) return { ok: true, result: `Target ${targetId} is already active.` };

    element.scrollIntoView({ block: "center", behavior: "smooth" });
    element.click();

    return (await awaitTargetActivation(target))
      ? { ok: true, result: `Activated ${targetId}.` }
      : { ok: false, result: `Target ${targetId} did not activate.` };
  };

  openRecord = async (input: OpenRecordData) => {
    if (!this.navigateCallback) return { ok: false, result: "Navigation is not available right now." };
    const segment = ENTITY_URL_SEGMENT[EntityType[input.entity]];
    const path =
      input.recordId === "new" || input.presentation !== "page"
        ? `/${segment}?open=${input.entity}:${input.recordId}`
        : `/${segment}/${input.recordId}`;
    const outcome = await this.navigateCallback(path);
    if (outcome === "navigated") {
      return {
        ok: true,
        result:
          input.recordId === "new"
            ? `Opened a blank ${input.entity} form for the user to fill in.`
            : `Opened the ${input.entity}.`,
      };
    }
    if (outcome === "blocked") {
      return {
        ok: false,
        result: "Navigation requires the user to resolve unsaved changes.",
      };
    }
    return { ok: false, result: `Opening the ${input.entity} did not finish.` };
  };

  private captureFocus() {
    this.previousFocus = captureOverlayFocusTarget(document.activeElement);
  }

  private scheduleClear(ms: number) {
    if (this.clearTimer) clearTimeout(this.clearTimer);
    this.clearTimer = setTimeout(() => {
      this.end();
    }, ms);
  }
}
