import { observable, runInAction } from "mobx";
import { describe, expect, it, vi } from "vitest";

import { NavigationGuardController } from "@/core/stores/navigation-guard.controller";

import { scheduleAgentRouteReload } from "../agent-route-reload";

function routeStore() {
  return observable({
    canApplyRouteReload: true,
    hasPendingRouteReload: true,
    isWorking: false,
    queuedPrompt: null as string | null,
    queuedPromptNeedsAttention: false,
    routeSyncStatus: "queued",
    markRouteSyncWaiting() {
      this.routeSyncStatus = "waiting";
    },
    markRouteSyncRefreshing() {
      this.routeSyncStatus = "refreshing";
    },
    markRouteSyncQueued() {
      this.routeSyncStatus = "queued";
    },
    takeRouteRefreshRequest() {
      if (!this.hasPendingRouteReload) return false;
      this.hasPendingRouteReload = false;
      return true;
    },
  });
}

function formBlocker({ dirty = false, loading = false } = {}) {
  return observable({
    withUnsavedChangesGuard: true,
    hasUnsavedChanges: dirty,
    isLoading: loading,
  });
}

describe("scheduleAgentRouteReload", () => {
  it("rechecks an agent draft after a dirty form releases the deferred reload", () => {
    const navigationGuard = new NavigationGuardController();
    const form = formBlocker({ dirty: true });
    const store = routeStore();
    const reload = vi.fn();
    navigationGuard.register(form as never);

    scheduleAgentRouteReload({
      store: store as never,
      navigationGuard,
      reload,
    });
    expect(store.routeSyncStatus).toBe("waiting");

    runInAction(() => {
      store.canApplyRouteReload = false;
      form.hasUnsavedChanges = false;
    });
    expect(reload).not.toHaveBeenCalled();
    expect(store.hasPendingRouteReload).toBe(true);

    runInAction(() => {
      store.canApplyRouteReload = true;
    });
    scheduleAgentRouteReload({
      store: store as never,
      navigationGuard,
      reload,
    });

    expect(reload).toHaveBeenCalledOnce();
    expect(store.hasPendingRouteReload).toBe(false);
    expect(store.routeSyncStatus).toBe("refreshing");
  });

  it("waits for a loading-only form before reloading exactly once", () => {
    const navigationGuard = new NavigationGuardController();
    const form = formBlocker({ loading: true });
    const store = routeStore();
    const reload = vi.fn();
    navigationGuard.register(form as never);

    scheduleAgentRouteReload({
      store: store as never,
      navigationGuard,
      reload,
    });
    expect(reload).not.toHaveBeenCalled();

    runInAction(() => {
      form.isLoading = false;
    });
    expect(reload).toHaveBeenCalledOnce();
    expect(store.hasPendingRouteReload).toBe(false);
  });

  it("keeps an active or queued follow-up in the queued state instead of blaming user edits", () => {
    const navigationGuard = new NavigationGuardController();
    const store = routeStore();
    const reload = vi.fn();
    runInAction(() => {
      store.canApplyRouteReload = false;
      store.isWorking = true;
      store.routeSyncStatus = "waiting";
    });

    scheduleAgentRouteReload({ store: store as never, navigationGuard, reload });
    expect(store.routeSyncStatus).toBe("queued");

    runInAction(() => {
      store.isWorking = false;
      store.queuedPrompt = "Run this next";
      store.routeSyncStatus = "waiting";
    });
    scheduleAgentRouteReload({ store: store as never, navigationGuard, reload });

    expect(store.routeSyncStatus).toBe("queued");
    expect(reload).not.toHaveBeenCalled();
  });

  it("marks a stranded queued prompt as waiting for user attention", () => {
    const navigationGuard = new NavigationGuardController();
    const store = routeStore();
    const reload = vi.fn();
    runInAction(() => {
      store.canApplyRouteReload = false;
      store.queuedPrompt = "Review this before retrying";
      store.queuedPromptNeedsAttention = true;
    });

    scheduleAgentRouteReload({ store: store as never, navigationGuard, reload });

    expect(store.routeSyncStatus).toBe("waiting");
    expect(reload).not.toHaveBeenCalled();
  });
});
