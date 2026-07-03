"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type TopBarActionsContextValue = {
  actions: ReactNode;
  setActions: (node: ReactNode) => void;
  override: ReactNode;
  setOverride: (node: ReactNode) => void;
};

const TopBarActionsContext = createContext<TopBarActionsContextValue | null>(null);

export function TopBarActionsProvider({ children }: { children: ReactNode }) {
  const [actions, setActions] = useState<ReactNode>(null);
  const [override, setOverride] = useState<ReactNode>(null);

  return (
    <TopBarActionsContext.Provider value={{ actions, setActions, override, setOverride }}>
      {children}
    </TopBarActionsContext.Provider>
  );
}

export function useTopBarActions() {
  const ctx = useContext(TopBarActionsContext);
  if (!ctx) throw new Error("useTopBarActions must be used within a TopBarActionsProvider");
  return ctx;
}

export function useSetTopBarActions(node: ReactNode): void {
  const setActions = useContext(TopBarActionsContext)?.setActions;

  useEffect(() => {
    if (!setActions) return;
    setActions(node);
    return () => setActions(null);
  }, [node, setActions]);
}

export function useSetTopBarActionsOverride(node: ReactNode): void {
  const setOverride = useContext(TopBarActionsContext)?.setOverride;

  useEffect(() => {
    if (!setOverride) return;
    setOverride(node);
    return () => setOverride(null);
  }, [node, setOverride]);
}
