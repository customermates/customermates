import { useSyncExternalStore } from "react";

function subscribeEmbeddedFrame() {
  return () => undefined;
}

export function useEmbeddedFrame() {
  return useSyncExternalStore(
    subscribeEmbeddedFrame,
    () => window.self !== window.top,
    () => false,
  );
}
