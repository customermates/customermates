"use client";

import { createContext, useContext, useRef } from "react";

export type OverlayDismissGuard = { current: (() => boolean) | null };

export const OverlayDismissGuardContext = createContext<OverlayDismissGuard | null>(null);

export function useOverlayDismissGuard() {
  return useContext(OverlayDismissGuardContext);
}

export function useOwnOverlayDismissGuard() {
  const guard = useRef<(() => boolean) | null>(null);

  function shouldKeepOpen() {
    return guard.current?.() ?? false;
  }

  return { guard, shouldKeepOpen };
}
