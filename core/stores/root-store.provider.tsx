"use client";

import type { ReactNode } from "react";
import type { TenantUser } from "@/features/user/user.schema";
import type { Company } from "@/generated/prisma";
import type { EntityTerminologyOverride } from "@/features/entity-terminology/entity-terminology.types";
import type { SubscriptionDto } from "@/ee/subscription/get-subscription.interactor";
import type { RoutingLocale } from "@/i18n/locale-registry";

import { createContext, useContext, useEffect, useState } from "react";

import { RootStore } from "@/core/stores/root.store";
import type { AppMode } from "@/core/config/environment";

const RootStoreContext = createContext<RootStore | null>(null);

type Props = {
  agentChatEnabled: boolean;
  appMode: AppMode;
  children: ReactNode;
  initialState: RootStoreInitialState;
};

export type RootStoreInitialState = {
  locale: RoutingLocale;
  user: TenantUser | null;
  company: Company | null;
  terminology: EntityTerminologyOverride[];
  subscription: SubscriptionDto | null;
};

function createRootStore(agentChatEnabled: boolean, appMode: AppMode, initialState: RootStoreInitialState): RootStore {
  const rootStore = new RootStore(appMode, agentChatEnabled);
  rootStore.localeStore.setLocale(initialState.locale);
  rootStore.userStore.setUser(initialState.user);
  rootStore.companyStore.setCompany(initialState.company);
  rootStore.terminologyStore.setOverrides(initialState.terminology);
  rootStore.subscriptionStore.setSubscription(initialState.subscription);
  return rootStore;
}

export function RootStoreProvider({ agentChatEnabled, appMode, children, initialState }: Props) {
  const [rootStore] = useState(() => createRootStore(agentChatEnabled, appMode, initialState));

  useEffect(() => {
    rootStore.intlStore.markClientHydrated();
  }, [rootStore]);

  return <RootStoreContext.Provider value={rootStore}>{children}</RootStoreContext.Provider>;
}

export function useRootStore() {
  const context = useContext(RootStoreContext);

  if (!context) throw new Error("useRootStore must be used within a RootStoreProvider");

  return context;
}
