"use client";

import type { ReactNode } from "react";

import { createContext, useContext } from "react";

const ProtectedEnhancementsContext = createContext<boolean | null>(null);

export function ProtectedEnhancementsProvider({ allowed, children }: { allowed: boolean; children?: ReactNode }) {
  return <ProtectedEnhancementsContext.Provider value={allowed}>{children}</ProtectedEnhancementsContext.Provider>;
}

export function useProtectedEnhancementsAllowed(): boolean {
  const allowed = useContext(ProtectedEnhancementsContext);
  if (allowed === null)
    throw new Error("useProtectedEnhancementsAllowed must be used within a ProtectedEnhancementsProvider");
  return allowed;
}
