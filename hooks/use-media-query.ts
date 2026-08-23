import { useCallback, useSyncExternalStore } from "react";

export const BREAKPOINT_QUERY = {
  sm: "(min-width: 40rem)",
  md: "(min-width: 48rem)",
  nav: "(min-width: 56rem)",
} as const;

export type BreakpointName = keyof typeof BREAKPOINT_QUERY;

const mediaQueryLists = new Map<string, MediaQueryList>();

function mediaQueryList(query: string) {
  const cached = mediaQueryLists.get(query);
  if (cached) return cached;

  const created = window.matchMedia(query);
  mediaQueryLists.set(query, created);
  return created;
}

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const list = mediaQueryList(query);
      list.addEventListener("change", onStoreChange);
      return () => list.removeEventListener("change", onStoreChange);
    },
    [query],
  );

  return useSyncExternalStore(
    subscribe,
    () => mediaQueryList(query).matches,
    () => true,
  );
}

export function useIsWiderThan(breakpoint: BreakpointName): boolean {
  return useMediaQuery(BREAKPOINT_QUERY[breakpoint]);
}
