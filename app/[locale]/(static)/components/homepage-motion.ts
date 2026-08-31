"use client";

import { useRef, useSyncExternalStore } from "react";

import { useInView, useReducedMotion } from "framer-motion";

export const HOMEPAGE_MOTION_VISIBILITY_AMOUNT = 0.35;

const documentVisibilitySubscribers = new Set<() => void>();

function notifyDocumentVisibilitySubscribers() {
  for (const subscriber of documentVisibilitySubscribers) subscriber();
}

function subscribeToDocumentVisibility(subscriber: () => void) {
  documentVisibilitySubscribers.add(subscriber);

  if (documentVisibilitySubscribers.size === 1)
    document.addEventListener("visibilitychange", notifyDocumentVisibilitySubscribers);

  return () => {
    documentVisibilitySubscribers.delete(subscriber);

    if (documentVisibilitySubscribers.size === 0)
      document.removeEventListener("visibilitychange", notifyDocumentVisibilitySubscribers);
  };
}

function getDocumentVisibilitySnapshot() {
  return document.visibilityState === "visible";
}

function getServerDocumentVisibilitySnapshot() {
  return true;
}

export function useHomepageMotion<T extends Element>(amount = HOMEPAGE_MOTION_VISIBILITY_AMOUNT) {
  const ref = useRef<T>(null);
  const isInView = useInView(ref, { amount });
  const shouldReduceMotion = useReducedMotion();
  const isDocumentVisible = useSyncExternalStore(
    subscribeToDocumentVisibility,
    getDocumentVisibilitySnapshot,
    getServerDocumentVisibilitySnapshot,
  );

  return {
    ref,
    shouldAnimate: isInView && isDocumentVisible && !shouldReduceMotion,
    shouldReduceMotion: Boolean(shouldReduceMotion),
  };
}
