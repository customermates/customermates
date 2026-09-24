"use client";

import type { ReactNode } from "react";
import type { NavigationGuardController } from "./navigation-guard.controller";

import { createContext, useContext } from "react";

const NavigationGuardContext = createContext<NavigationGuardController | null>(null);

type Props = {
  children: ReactNode;
  guard: NavigationGuardController;
};

export function NavigationGuardProvider({ children, guard }: Props) {
  return <NavigationGuardContext.Provider value={guard}>{children}</NavigationGuardContext.Provider>;
}

export function useNavigationGuard(): NavigationGuardController | null {
  return useContext(NavigationGuardContext);
}
