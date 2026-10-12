"use client";

import { createContext, useContext, type ReactNode } from "react";

type MenuSurfaceKind = "dropdown" | "context";

const MenuSurfaceContext = createContext<MenuSurfaceKind>("dropdown");

export function MenuSurface({ value, children }: { value: MenuSurfaceKind; children: ReactNode }) {
  return <MenuSurfaceContext.Provider value={value}>{children}</MenuSurfaceContext.Provider>;
}

export function useMenuSurface() {
  return useContext(MenuSurfaceContext);
}
