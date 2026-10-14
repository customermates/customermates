import { useSyncExternalStore } from "react";

const TOUCH_INPUT = "not all and (hover: hover) and (pointer: fine)";

function touchQuery() {
  return typeof window.matchMedia === "function" ? window.matchMedia(TOUCH_INPUT) : null;
}

function subscribeTouchInput(onChange: () => void) {
  const query = touchQuery();
  query?.addEventListener("change", onChange);
  return () => query?.removeEventListener("change", onChange);
}

export function useTouchInput() {
  return useSyncExternalStore(
    subscribeTouchInput,
    () => touchQuery()?.matches ?? false,
    () => false,
  );
}
