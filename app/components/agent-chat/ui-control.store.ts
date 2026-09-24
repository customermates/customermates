import { makeObservable, observable, action } from "mobx";

import type { RootStore } from "@/core/stores/root.store";

import { BaseStore } from "@/core/base/base.store";
import { ENTITY_URL_SEGMENT } from "@/components/entity-detail/entity-relations";
import { EntityType } from "@/generated/prisma";
import {
  agentRouteVisible,
  findAgentNavigationTarget,
  findAgentUiTarget,
  type AgentUiTarget,
} from "@/ee/agent-chat/ui-targets";
import { stripLocalePrefix } from "@/i18n/locale-registry";
import { NavigateRecordTargetSchema } from "@/ee/agent-chat/ui-operations";
import { agentGuidedTour, type AgentGuidedTourStep, type AgentTourStepData } from "@/ee/agent-chat/agent-tours";
import {
  captureOverlayFocusTarget,
  focusOverlayTarget,
  type OverlayFocusTarget,
} from "@/components/ui/overlay-focus-target";

export type Spotlight = {
  targetId: string;
  note: string | null;
  stepIndex: number;
  totalSteps: number;
};

export type AgentNavigationOutcome = "navigated" | "blocked" | "timeout";

function resolveAgentNavigationRoute(input: Record<string, unknown>): { path: string; done: string } | null {
  const record = NavigateRecordTargetSchema.safeParse(input);
  if (record.success) {
    const segment = ENTITY_URL_SEGMENT[EntityType[record.data.entity]];
    return { path: `/${segment}/${record.data.recordId}`, done: `Opened the ${record.data.entity} on its page.` };
  }
  const target = findAgentNavigationTarget(String(input.targetId ?? ""));
  return target ? { path: target.route, done: `Navigated to ${target.route}.` } : null;
}

function describeNavigationInput(input: Record<string, unknown>) {
  return input.targetId !== undefined ? String(input.targetId) : `${String(input.entity)}:${String(input.recordId)}`;
}

function currentAppPathname() {
  if (typeof window === "undefined") return null;
  const pathname = stripLocalePrefix(window.location.pathname);
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
}

function isSidebarTarget(target: AgentUiTarget) {
  return target.id.startsWith("nav-");
}

function targetBelongsToCurrentPage(targetId: string) {
  const target = findAgentUiTarget(targetId);
  const pathname = currentAppPathname();
  if (!target || pathname === null) return false;
  return target.route === "*" || isSidebarTarget(target) || target.route === pathname;
}

function unavailableRouteMessage(path: string) {
  return `The page ${path} is not available to this user's role or installation; the app would redirect to the Dashboard. Tell the user instead of navigating or highlighting.`;
}

export function findAgentTargetElement(targetId: string) {
  const element = document.getElementById(targetId);
  return element?.isConnected && element.getClientRects().length > 0 ? element : null;
}

const TARGET_SETTLE_TIMEOUT_MS = 2000;
const TARGET_SETTLE_POLL_MS = 100;

async function awaitAgentTargetElement(targetId: string, stillCurrent: () => boolean = () => true) {
  const deadline = Date.now() + TARGET_SETTLE_TIMEOUT_MS;
  for (;;) {
    const element = findAgentTargetElement(targetId);
    if (element || Date.now() >= deadline || !stillCurrent()) return element;
    await new Promise<void>((resolve) => setTimeout(resolve, TARGET_SETTLE_POLL_MS));
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

  navigate = async (input: Record<string, unknown>) => {
    const route = resolveAgentNavigationRoute(input);
    if (!route) {
      return {
        ok: false,
        result: `Navigation target ${describeNavigationInput(input)} is not allowed.`,
      };
    }
    if (!this.canOpen(route.path)) return { ok: false, result: unavailableRouteMessage(route.path) };
    if (!this.navigateCallback) return { ok: false, result: "Navigation is not available right now." };

    const outcome = await this.navigateCallback(route.path);
    if (outcome === "navigated") return { ok: true, result: route.done };
    if (outcome === "blocked") {
      return {
        ok: false,
        result: "Navigation requires the user to resolve unsaved changes.",
      };
    }
    return {
      ok: false,
      result: `Navigation to ${route.path} did not finish.`,
    };
  };

  highlight = async (targetId: string) => {
    const element = targetBelongsToCurrentPage(targetId)
      ? await awaitAgentTargetElement(targetId)
      : findAgentTargetElement(targetId);
    if (!element) {
      return {
        ok: false,
        result: this.missingTargetMessage(targetId),
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
    const shown = await this.showTourStep(0, runVersion, 1);
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

  private async showTourStep(index: number, runVersion: number, direction: 1 | -1): Promise<boolean> {
    if (runVersion !== this.tourRunVersion) return false;
    const step = this.tourSteps[index];
    if (!step) return false;

    if (step.route && this.navigateCallback) {
      const outcome = this.canOpen(step.route) ? await this.navigateCallback(step.route) : "blocked";
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

    const element = await awaitAgentTargetElement(step.targetId, () => runVersion === this.tourRunVersion);
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

  private canOpen(path: string) {
    return agentRouteVisible(path, this.rootStore.appMode, this.rootStore.userStore.canAccess);
  }

  private missingTargetMessage(targetId: string) {
    const target = findAgentUiTarget(targetId);
    if (target?.route.startsWith("/") && !this.canOpen(target.route))
      return `Target ${targetId} cannot be shown. ${unavailableRouteMessage(target.route)}`;
    if (!target || !targetBelongsToCurrentPage(targetId))
      return `Target ${targetId} is not on the current page. Navigate first.`;
    const opener = target.prerequisite ? ` (${target.prerequisite})` : "";
    return `Target ${targetId} belongs to this page but is not rendered right now. It may be inside a dialog, tab or menu the user must open first${opener}, or hidden by role, plan or state.`;
  }

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
