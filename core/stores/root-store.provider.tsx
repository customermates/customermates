"use client";

import type { ReactNode } from "react";

import { createContext, useContext, useMemo } from "react";

import { RootStore } from "@/core/stores/root.store";
import type { AppMode } from "@/core/config/environment";

const RootStoreContext = createContext<RootStore | null>(null);

type Props = {
  appMode: AppMode;
  children: ReactNode;
};

export function RootStoreProvider({ appMode, children }: Props) {
  const rootStore = useMemo(() => new RootStore(appMode), [appMode]);

  return <RootStoreContext.Provider value={rootStore}>{children}</RootStoreContext.Provider>;
}

export function useRootStore() {
  const context = useContext(RootStoreContext);

  if (!context) throw new Error("useRootStore must be used within a RootStoreProvider");

  return context;
}
