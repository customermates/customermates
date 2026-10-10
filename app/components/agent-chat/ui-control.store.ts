import { getRecordAction, getRecordNavigationAction } from "@/app/[locale]/(protected)/records/actions";
import { makeObservable, observable, action } from "mobx";

import type { RootStore } from "@/core/stores/root.store";

import { BaseStore } from "@/core/base/base.store";
import {
  agentRouteVisible,
  agentSidebarGroupId,
  SETTINGS_MENU_TARGET,
  findAgentNavigationTarget,
  findAgentUiTarget,
  type AgentUiTarget,
} from "@/ee/agent-chat/ui-targets";
import { stripLocalePrefix } from "@/i18n/locale-registry";
import { isResolvedAppLinkPath } from "@/features/docs/app-links";
import { focusTargetOfHref } from "@/components/focus/focus-href";
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
  if (record.success)
    return { path: `/records/${record.data.typeId}/${record.data.recordId}`, done: "Opened the record on its page." };

  if (typeof input.href === "string" && isResolvedAppLinkPath(input.href))
    return { path: input.href, done: `Opened ${input.href}.` };

  const target = findAgentNavigationTarget(String(input.targetId ?? ""));
  return target ? { path: target.route, done: `Navigated to ${target.route}.` } : null;
}

function describeNavigationInput(input: Record<string, unknown>) {
  if (input.href !== undefined) return String(input.href);
  return input.targetId !== undefined ? String(input.targetId) : `${String(input.typeId)}:${String(input.recordId)}`;
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
  const target = findAgentUiTarget(targetId);
  if (target?.elementId && currentAppPathname() !== target.route) return null;
  const element = document.getElementById(target?.elementId ?? targetId);
  return element?.isConnected && element.getClientRects().length > 0 ? element : null;
}

const TARGET_SETTLE_TIMEOUT_MS = 2000;
const TARGET_LOADING_TIMEOUT_MS = 8000;
const TARGET_SETTLE_POLL_MS = 100;
const TOUR_START_TIMEOUT_MS = 12_000;

function routeIsLoading() {
  return document.querySelector('main [data-page-state="loading"]') !== null;
}

async function awaitAgentTargetElement(
  targetId: string,
  stillCurrent: () => boolean = () => true,
  settleFrom = Date.now(),
) {
  const settled = settleFrom + TARGET_SETTLE_TIMEOUT_MS;
  const loadingLimit = settleFrom + TARGET_LOADING_TIMEOUT_MS;
  let deadline = settled;
  for (;;) {
    const element = findAgentTargetElement(targetId);
    if (element || !stillCurrent()) return element;
    const now = Date.now();
    if (now >= settled && now < loadingLimit && routeIsLoading())
      deadline = Math.min(loadingLimit, now + TARGET_SETTLE_TIMEOUT_MS);
    if (now >= deadline) return null;
    await new Promise<void>((resolve) => setTimeout(resolve, TARGET_SETTLE_POLL_MS));
  }
}

const ASSISTANT_PANEL_ID = "agent-panel-dialog";

function assistantPanelCovers(element: Element) {
  const panel = document.getElementById(ASSISTANT_PANEL_ID);
  if (!panel || panel.contains(element)) return false;
  const cover = panel.getBoundingClientRect();
  const target = element.getBoundingClientRect();
  const x = target.left + target.width / 2;
  const y = target.top + target.height / 2;
  return (
    cover.width > 0 && cover.height > 0 && x >= cover.left && x <= cover.right && y >= cover.top && y <= cover.bottom
  );
}

async function awaitCoveredByAssistantPanel(targetId: string, stillCurrent: () => boolean) {
  if (!document.getElementById(ASSISTANT_PANEL_ID)) return false;
  const deadline = Date.now() + TARGET_SETTLE_TIMEOUT_MS;
  let previous: DOMRect | null = null;
  for (;;) {
    const element = findAgentTargetElement(targetId);
    if (!element || !stillCurrent()) return false;
    const current = element.getBoundingClientRect();
    if ((previous && current.top === previous.top && current.left === previous.left) || Date.now() >= deadline)
      return assistantPanelCovers(element);
    previous = current;
    await new Promise<void>((resolve) => setTimeout(resolve, TARGET_SETTLE_POLL_MS));
  }
}

function coveredTargetMessage(targetId: string) {
  return `Target ${targetId} is on screen but behind the assistant panel, so the user cannot see or click it. Ask the user to close the panel (an open dialog stays open) and use the control, instead of saying it is highlighted.`;
}

function sidebarRevealStep(target: AgentUiTarget) {
  if (!document.getElementById("sidebar-trigger")) return null;
  const group = agentSidebarGroupId(target.id);
  const anchor = document.getElementById(group ?? target.id);
  const groupClosed = group !== null && document.getElementById(target.id) === null;
  const openGroup = (where: string) =>
    group === SETTINGS_MENU_TARGET ? `open ${group}${where} and choose Settings` : `open ${group}${where}`;
  if (!anchor) {
    const groupOpensItself = currentAppPathname()?.startsWith(`/${target.route.split("/")[1]}/`) ?? false;
    const thenOpenGroup = group && !groupOpensItself ? `, then ${openGroup(" in it")}` : "";
    return `open the sidebar with the sidebar button at the top left of the header${thenOpenGroup}`;
  }
  if (anchor.closest('[data-collapsible="icon"]'))
    return `expand the collapsed sidebar with the sidebar button at the top left of the header${groupClosed ? `, then ${openGroup(" in it")}` : ""}`;
  return groupClosed ? openGroup(" in the sidebar") : null;
}

export class AgentUiControlStore extends BaseStore {
  active: Spotlight | null = null;
  private tourSteps: AgentGuidedTourStep[] = [];
  private navigateCallback: ((path: string) => Promise<AgentNavigationOutcome>) | null = null;
  private clearTimer: ReturnType<typeof setTimeout> | null = null;
  private previousFocus: OverlayFocusTarget | null = null;
  private pageFocus: OverlayFocusTarget | null = null;
  private tourRunVersion = 0;
  private settledTourRunVersion = 0;
  private vanishedTourStep: { spotlight: Spotlight; since: number; skipped: boolean } | null = null;

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
    const record = NavigateRecordTargetSchema.safeParse(input);
    if (record.success) {
      const result = await getRecordAction(record.data);
      if (!result.ok)
        return { ok: false, result: "The record is unavailable or cannot be read with your current access." };
    } else if (route.path.startsWith("/records/") || focusTargetOfHref(route.path)?.kind === "list") {
      const navigation = await getRecordNavigationAction();
      const typeId = /[0-9a-f-]{36}/.exec(route.path)?.[0];
      if (!navigation.types.some((type) => type.id === typeId) || !this.canOpen(route.path.split("?")[0]))
        return { ok: false, result: unavailableRouteMessage(route.path) };
    } else if (!this.canOpen(route.path.split("?")[0]))
      return { ok: false, result: unavailableRouteMessage(route.path) };
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
    let element = findAgentTargetElement(targetId);
    if (!element && !this.blockedTargetMessage(targetId) && targetBelongsToCurrentPage(targetId))
      element = await awaitAgentTargetElement(targetId);
    if (!element) {
      return {
        ok: false,
        result: this.missingTargetMessage(targetId),
      };
    }

    const runVersion = ++this.tourRunVersion;
    this.tourSteps = [];
    this.showStep({ targetId, note: null, stepIndex: 0, totalSteps: 1 });
    this.scheduleClear(8000);
    element.scrollIntoView({ block: "center", behavior: "smooth" });
    if (await awaitCoveredByAssistantPanel(targetId, () => runVersion === this.tourRunVersion)) {
      this.end();
      return { ok: false, result: coveredTargetMessage(targetId) };
    }
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
    const startedAt = Date.now();
    const shown = await this.showTourStep(0, runVersion, 1, startedAt, startedAt + TOUR_START_TIMEOUT_MS);
    this.settleTourStep(runVersion);
    const shownTargetId = this.active?.targetId;
    if (
      shown &&
      shownTargetId &&
      (await awaitCoveredByAssistantPanel(shownTargetId, () => runVersion === this.tourRunVersion))
    ) {
      this.end();
      return { ok: false, result: coveredTargetMessage(shownTargetId) };
    }
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
    this.vanishedTourStep = null;
    if (this.clearTimer) clearTimeout(this.clearTimer);
    focusOverlayTarget(this.pageFocus, this.previousFocus);
    this.pageFocus = null;
    this.previousFocus = null;
  };

  rememberPageFocus = (element: Element) => {
    if (this.active && this.active.note !== null) this.pageFocus = captureOverlayFocusTarget(element);
  };

  showStep = (spotlight: Spotlight) => {
    if (this.clearTimer) clearTimeout(this.clearTimer);
    this.active = spotlight;
  };

  reportTourTarget = (spotlight: Spotlight, rendered: boolean) => {
    if (
      spotlight !== this.active ||
      spotlight.note === null ||
      rendered ||
      this.settledTourRunVersion !== this.tourRunVersion
    ) {
      this.vanishedTourStep = null;
      return;
    }
    if (this.vanishedTourStep?.spotlight !== spotlight)
      this.vanishedTourStep = { spotlight, since: Date.now(), skipped: false };
    if (this.vanishedTourStep.skipped || Date.now() - this.vanishedTourStep.since < TARGET_SETTLE_TIMEOUT_MS) return;
    this.vanishedTourStep.skipped = true;
    const route = this.tourSteps[spotlight.stepIndex]?.route;
    if (route && route !== currentAppPathname()) this.end();
    else this.nextStep();
  };

  private requestTourStep(index: number, direction: 1 | -1) {
    const runVersion = ++this.tourRunVersion;
    void this.showTourStep(index, runVersion, direction, Date.now(), Number.POSITIVE_INFINITY, true).then(() =>
      this.settleTourStep(runVersion),
    );
  }

  private settleTourStep(runVersion: number) {
    if (runVersion === this.tourRunVersion) this.settledTourRunVersion = runVersion;
  }

  private async showTourStep(
    index: number,
    runVersion: number,
    direction: 1 | -1,
    settleFrom = Date.now(),
    giveUpAt = Number.POSITIVE_INFINITY,
    skipCovered = false,
  ): Promise<boolean> {
    if (runVersion !== this.tourRunVersion) return false;
    const step = this.tourSteps[index];
    if (!step) return false;
    if (Date.now() >= giveUpAt) {
      if (direction === 1) this.end();
      return false;
    }

    if (step.route && this.navigateCallback) {
      const from = currentAppPathname();
      const outcome = this.canOpen(step.route) ? await this.navigateCallback(step.route) : "blocked";
      if (runVersion !== this.tourRunVersion) return false;
      if (outcome !== "navigated")
        return this.showFollowingTourStep(index, runVersion, direction, settleFrom, giveUpAt, skipCovered);
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      if (runVersion !== this.tourRunVersion) return false;
      if (currentAppPathname() !== from) settleFrom = Date.now();
    }

    const element = await awaitAgentTargetElement(
      step.targetId,
      () => runVersion === this.tourRunVersion && Date.now() < giveUpAt,
      settleFrom,
    );
    if (runVersion !== this.tourRunVersion) return false;
    if (!element) return this.showFollowingTourStep(index, runVersion, direction, settleFrom, giveUpAt, skipCovered);

    element.scrollIntoView({
      block: "center",
      behavior: "smooth",
    });
    if (skipCovered && (await awaitCoveredByAssistantPanel(step.targetId, () => runVersion === this.tourRunVersion)))
      return this.showFollowingTourStep(index, runVersion, direction, settleFrom, giveUpAt, skipCovered);
    if (runVersion !== this.tourRunVersion) return false;
    this.showStep({
      targetId: step.targetId,
      note: step.note,
      stepIndex: index,
      totalSteps: this.tourSteps.length,
    });
    return true;
  }

  private async showFollowingTourStep(
    index: number,
    runVersion: number,
    direction: 1 | -1,
    settleFrom: number,
    giveUpAt: number,
    skipCovered: boolean,
  ): Promise<boolean> {
    const next = index + direction;
    if (next < 0 || next >= this.tourSteps.length) {
      if (direction === 1) this.end();
      return false;
    }
    return this.showTourStep(next, runVersion, direction, settleFrom, giveUpAt, skipCovered);
  }

  private canOpen(path: string) {
    return agentRouteVisible(path, this.rootStore.appMode, this.rootStore.userStore.canAccess);
  }

  private blockedTargetMessage(targetId: string) {
    const target = findAgentUiTarget(targetId);
    return target?.route.startsWith("/") && !this.canOpen(target.route)
      ? `Target ${targetId} cannot be shown. ${unavailableRouteMessage(target.route)}`
      : null;
  }

  private missingTargetMessage(targetId: string) {
    const blocked = this.blockedTargetMessage(targetId);
    if (blocked) return blocked;
    const target = findAgentUiTarget(targetId);
    if (!target || !targetBelongsToCurrentPage(targetId))
      return `Target ${targetId} is not on the current page. Navigate first.`;
    const revealStep = isSidebarTarget(target) ? sidebarRevealStep(target) : null;
    if (revealStep)
      return `Target ${targetId} is a sidebar entry that is not visible right now. Ask the user to ${revealStep}, then highlight it again.`;
    const opener = target.prerequisite ? ` (${target.prerequisite})` : "";
    return `Target ${targetId} belongs to this page but is not rendered right now. It may be inside a dialog, tab or menu the user must open first${opener}, or hidden by role, plan or state.`;
  }

  private captureFocus() {
    this.previousFocus = captureOverlayFocusTarget(document.activeElement);
    this.pageFocus = null;
  }

  private scheduleClear(ms: number) {
    if (this.clearTimer) clearTimeout(this.clearTimer);
    this.clearTimer = setTimeout(() => {
      this.end();
    }, ms);
  }
}
