"use client";

import type { ReactNode } from "react";
import type { TenantUser } from "@/features/user/user.schema";
import type { SubscriptionDto } from "@/ee/subscription/get-subscription.interactor";
import type { RoutingLocale } from "@/i18n/locale-registry";
import type { RecordNavigation } from "@/features/records/record-navigation.schema";

import { createContext, useContext, useEffect, useLayoutEffect, useState } from "react";

import { RootStore } from "@/core/stores/root.store";
import { NavigationGuardProvider } from "@/core/stores/navigation-guard.context";
import type { AppMode } from "@/core/config/environment";
import { initializeNavigationHistoryGuard } from "@/components/modal/navigation-history-guard";

const RootStoreContext = createContext<RootStore | null>(null);

type Props = {
  agentChatEnabled: boolean;
  appMode: AppMode;
  children: ReactNode;
  initialState: RootStoreInitialState;
};

export type RootStoreInitialState = {
  recordNavigation?: RecordNavigation | null;
  locale: RoutingLocale;
  user: TenantUser | null;
  subscription: SubscriptionDto | null;
};

function createRootStore(agentChatEnabled: boolean, appMode: AppMode, initialState: RootStoreInitialState): RootStore {
  const rootStore = new RootStore(appMode, agentChatEnabled);
  rootStore.localeStore.setLocale(initialState.locale);
  rootStore.userStore.setUser(initialState.user);
  rootStore.subscriptionStore.setSubscription(initialState.subscription);
  rootStore.recordWorkspaceStore.setNavigation(initialState.recordNavigation ?? null);
  return rootStore;
}

export function RootStoreProvider({ agentChatEnabled, appMode, children, initialState }: Props) {
  const [rootStore] = useState(() => createRootStore(agentChatEnabled, appMode, initialState));
  useLayoutEffect(() => {
    initializeNavigationHistoryGuard();
  }, []);

  useEffect(() => {
    rootStore.intlStore.markClientHydrated();
  }, [rootStore]);

  return (
    <RootStoreContext.Provider value={rootStore}>
      <NavigationGuardProvider guard={rootStore.navigationGuard}>{children}</NavigationGuardProvider>
    </RootStoreContext.Provider>
  );
}

export function useRootStore() {
  const context = useContext(RootStoreContext);

  if (!context) throw new Error("useRootStore must be used within a RootStoreProvider");

  return context;
}
