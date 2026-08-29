"use client";

import { useEffect } from "react";
import { observer } from "mobx-react-lite";

import type { AgentChatStore } from "./agent-chat.store";
import type { NavigationGuardController } from "@/core/stores/navigation-guard.controller";

import { useRootStore } from "@/core/stores/root-store.provider";

const reloadCurrentPage = () => window.location.reload();

export function scheduleAgentRouteReload({
  store,
  navigationGuard,
  reload,
}: {
  store: AgentChatStore;
  navigationGuard: NavigationGuardController;
  reload: () => void;
}) {
  if (!store.hasPendingRouteReload) return;
  if (!store.canApplyRouteReload) {
    if (!store.isWorking && (!store.queuedPrompt || store.queuedPromptNeedsAttention)) store.markRouteSyncWaiting();
    else store.markRouteSyncQueued();
    return;
  }
  if (navigationGuard.isRouteRefreshBlocked) store.markRouteSyncWaiting();
  navigationGuard.requestRouteRefreshWhenSafe(() => {
    if (!store.canApplyRouteReload || !store.hasPendingRouteReload) {
      if (store.hasPendingRouteReload) {
        if (!store.isWorking && (!store.queuedPrompt || store.queuedPromptNeedsAttention)) store.markRouteSyncWaiting();
        else store.markRouteSyncQueued();
      }
      return;
    }
    if (!store.takeRouteRefreshRequest()) return;
    store.markRouteSyncRefreshing();
    reload();
  });
}

export const AgentRouteReloadBridge = observer(function AgentRouteReloadBridge({
  reload = reloadCurrentPage,
}: {
  reload?: () => void;
}) {
  const { agentChatStore: store, navigationGuard } = useRootStore();

  useEffect(() => {
    scheduleAgentRouteReload({ store, navigationGuard, reload });
  }, [
    navigationGuard,
    navigationGuard.isRouteRefreshBlocked,
    reload,
    store,
    store.canApplyRouteReload,
    store.hasPendingRouteReload,
    store.isWorking,
    store.queuedPrompt,
    store.queuedPromptNeedsAttention,
    store.routeRefreshRevision,
  ]);

  return null;
});
