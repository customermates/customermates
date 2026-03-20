"use client";

import type { ReactNode } from "react";

import { createContext, useContext, useMemo } from "react";

import { RootStore } from "@/core/stores/root.store";

const RootStoreContext = createContext<RootStore | null>(null);

type Props = {
  children: ReactNode;
  initialNavbarVisible?: boolean;
  initialSidebarOpen?: boolean;
  isDemoMode?: boolean;
  isCloudHosted?: boolean;
};

export function RootStoreProvider({
  children,
  initialNavbarVisible,
  initialSidebarOpen,
  isDemoMode,
  isCloudHosted,
}: Props) {
  const rootStore = useMemo(
    () => new RootStore(initialSidebarOpen, initialNavbarVisible, isDemoMode, isCloudHosted),
    [initialNavbarVisible, initialSidebarOpen, isDemoMode, isCloudHosted],
  );

  return <RootStoreContext.Provider value={rootStore}>{children}</RootStoreContext.Provider>;
}

export function useRootStore() {
  const context = useContext(RootStoreContext);

  if (!context) throw new Error("useRootStore must be used within a RootStoreProvider");

  return context;
}
