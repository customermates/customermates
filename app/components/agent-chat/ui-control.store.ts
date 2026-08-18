import equal from "fast-deep-equal";
import { makeObservable, observable, action, toJS } from "mobx";

import type { RootStore } from "@/core/stores/root.store";
import type { BaseFormStore } from "@/core/base/base-form.store";
import type { ConfigureViewData, FillFormData, OpenRecordData } from "@/features/agent-chat/ui-operations";

import { BaseStore } from "@/core/base/base.store";
import { ViewMode } from "@/core/base/base-query-builder";
import { ENTITY_URL_SEGMENT } from "@/components/entity-detail/entity-relations";
import { EntityType } from "@/generated/prisma";
import { findAgentNavigationTarget } from "@/features/agent-chat/ui-targets";
import { AGENT_VIEW_ROUTES } from "@/features/agent-chat/ui-operations";
import {
  resolveDataViewStore,
  resolveGroupByColumn,
  resolveSortColumn,
  toFilters,
  toSortDescriptor,
} from "./agent-view-ops";
import { resolveFormStore, resolveFormField } from "./agent-form-ops";
import { agentGuidedTour, type AgentGuidedTourStep, type AgentTourStepData } from "@/features/agent-chat/agent-tours";
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
    if (!this.tourSteps.length) return { ok: false, result: "None of the tour targets exist in this interface." };

    this.captureFocus();
    const runVersion = ++this.tourRunVersion;
    const shown = await this.showTourStep(0, runVersion, 1, true);
    return shown
      ? { ok: true, result: `Started a ${this.tourSteps.length}-step guided tour.` }
      : { ok: false, result: "None of the tour targets are reachable right now." };
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

  private formFillSnapshots = new WeakMap<BaseFormStore<Record<string, unknown>>, unknown>();

  configureView = async (input: ConfigureViewData) => {
    const store = resolveDataViewStore(this.rootStore, input.view);
    if (!store) return { ok: false, result: `The view ${input.view} is not available.` };

    const route = AGENT_VIEW_ROUTES[input.view];
    if (route && window.location.pathname.split("/").slice(2).join("/") !== route.slice(1)) {
      if (!this.navigateCallback) return { ok: false, result: "Navigation is not available right now." };
      const outcome = await this.navigateCallback(route);
      if (outcome === "blocked")
        return { ok: false, result: "Navigation requires the user to resolve unsaved changes." };
      if (outcome !== "navigated") return { ok: false, result: `Could not open ${route}.` };
    }
    const ready = await this.awaitViewReady(store);
    if (!ready) return { ok: false, result: "The view did not finish loading." };

    const applied: string[] = [];
    if (input.layout === "table") {
      store.setViewOptions({ viewMode: ViewMode.table });
      applied.push("table layout");
    } else if (input.layout === "cards") {
      store.setViewOptions({ viewMode: ViewMode.card, groupingColumnId: undefined });
      applied.push("card layout");
    } else if (input.layout === "kanban") {
      const grouping = input.groupBy
        ? resolveGroupByColumn(store, input.groupBy)
        : store.singleSelectCustomColumns.length > 0
          ? { ok: true as const, value: store.groupingColumnId ?? store.singleSelectCustomColumns[0].id }
          : resolveGroupByColumn(store, "");
      if (!grouping.ok) return { ok: false, result: grouping.message };
      store.setViewOptions({ viewMode: ViewMode.card, groupingColumnId: grouping.value });
      applied.push("kanban layout");
    }
    if (input.groupBy && input.layout === undefined) {
      if (input.groupBy.trim().toLowerCase() === "none") {
        store.setViewOptions({ groupingColumnId: undefined });
        applied.push("grouping cleared");
      } else {
        const grouping = resolveGroupByColumn(store, input.groupBy);
        if (!grouping.ok) return { ok: false, result: grouping.message };
        store.setViewOptions({ viewMode: ViewMode.card, groupingColumnId: grouping.value });
        applied.push(`grouped by ${input.groupBy}`);
      }
    }
    if (input.sortBy) {
      const sort = resolveSortColumn(store, input.sortBy);
      if (!sort.ok) return { ok: false, result: sort.message };
      store.setQueryOptions({ sortDescriptor: toSortDescriptor(sort.value, input.sortDirection) });
      applied.push(`sorted by ${input.sortBy} ${input.sortDirection ?? "asc"}`);
    }
    if (input.search !== undefined) {
      store.setQueryOptions({ searchTerm: input.search });
      applied.push(input.search ? `search "${input.search}"` : "search cleared");
    }
    if (input.clearFilters) {
      store.setQueryOptions({ filters: [], forceRefresh: true });
      applied.push("filters cleared");
    } else if (input.filters?.length) {
      const filters = toFilters(store, input.filters);
      if (!filters.ok) return { ok: false, result: filters.message };
      store.setQueryOptions({ filters: filters.value });
      applied.push(`${filters.value.length} ${filters.value.length === 1 ? "filter" : "filters"}`);
    }

    if (applied.length) await store.refreshQuery().catch(() => undefined);

    return {
      ok: true,
      result: applied.length ? `Adjusted the ${input.view} view: ${applied.join(", ")}.` : "Nothing to change.",
    };
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
            ? `Opened a blank ${input.entity} form. Fill it with fill_form; the user presses Save.`
            : `Opened the ${input.entity}.`,
      };
    }
    if (outcome === "blocked") return { ok: false, result: "Navigation requires the user to resolve unsaved changes." };
    return { ok: false, result: `Opening the ${input.entity} did not finish.` };
  };

  fillForm = async (input: FillFormData) => {
    const store = resolveFormStore(this.rootStore, input.form);
    if (!store) return { ok: false, result: `The form ${input.form} is not available.` };
    if (!this.rootStore.navigationGuard.isRegistered(store)) {
      return {
        ok: false,
        result: `The ${input.form} form is not open. Open it first (open_record with recordId "new" creates a blank one).`,
      };
    }
    if (store.hasUnsavedChanges && !equal(toJS(store.form), this.formFillSnapshots.get(store))) {
      return {
        ok: false,
        result:
          "This form has unsaved changes made by the user. Never overwrite them - ask the user to save or discard first.",
      };
    }

    const filled: string[] = [];
    for (const entry of input.fields) {
      const resolution = resolveFormField(store, entry.field, entry.value);
      if (!resolution.ok) return { ok: false, result: resolution.message };
      if (typeof document !== "undefined")
        document.getElementById(resolution.path)?.scrollIntoView({ block: "center", behavior: "smooth" });
      store.onChange(resolution.path, resolution.value);
      filled.push(entry.field);
      await new Promise<void>((resolve) => setTimeout(resolve, 150));
    }
    this.formFillSnapshots.set(store, structuredClone(toJS(store.form)));

    if (input.submit) {
      if (!store.onSubmit) return { ok: false, result: "This form cannot be submitted by the assistant." };
      await store.onSubmit();
      this.formFillSnapshots.delete(store);
      if (store.error) return { ok: false, result: "Saving failed; the form shows what needs correcting." };
      return { ok: true, result: `Filled ${filled.join(", ")} and saved the form.` };
    }

    return { ok: true, result: `Filled ${filled.join(", ")}. The user reviews and presses Save.` };
  };

  private awaitViewReady = async (store: { isReady: boolean }) => {
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      if (store.isReady) return true;
      await new Promise<void>((resolve) => setTimeout(resolve, 100));
    }
    return store.isReady;
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
