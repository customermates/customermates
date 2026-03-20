import { useMemo } from "react";

export function useIsTouchDevice() {
  return useMemo(() => {
    if (typeof window === "undefined") return false;

    if (navigator.maxTouchPoints > 0) return true;

    if (window.matchMedia("(pointer: coarse)").matches) return true;

    return false;
  }, []);
}
