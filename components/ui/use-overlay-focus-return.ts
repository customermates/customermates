"use client";

import { useCallback, useRef } from "react";

import {
  captureOverlayFocusTarget,
  focusOverlayTarget,
  type OverlayFocusTarget,
  usableOverlayFocusTarget,
} from "./overlay-focus-target";

export function useOverlayFocusReturn(
  open?: boolean,
  preferredOpener?: HTMLElement | null,
  fallbackOpener?: HTMLElement | null,
) {
  const openRef = useRef(open);
  const previousOpenRef = useRef(open);
  const openerRef = useRef<OverlayFocusTarget | null>(null);
  const fallbackRef = useRef<OverlayFocusTarget | null>(null);
  const capturedRef = useRef(false);
  const generationRef = useRef(0);

  const captureOpener = useCallback((element: Element | null, fallback?: HTMLElement | null) => {
    openerRef.current = captureOverlayFocusTarget(element);
    fallbackRef.current = captureOverlayFocusTarget(fallback ?? null);
    capturedRef.current = Boolean(openerRef.current || fallbackRef.current);
  }, []);

  if (open === true && previousOpenRef.current !== true) {
    generationRef.current += 1;
    captureOpener(preferredOpener ?? (typeof document === "undefined" ? null : document.activeElement), fallbackOpener);
  }

  openRef.current = open;
  previousOpenRef.current = open;

  const onOpenAutoFocus = useCallback(() => {
    if (capturedRef.current) return;

    captureOpener(preferredOpener ?? document.activeElement, fallbackOpener);
  }, [captureOpener, fallbackOpener, preferredOpener]);

  const focusOpener = useCallback(() => {
    if (openRef.current === true) return;
    focusOverlayTarget(openerRef.current, fallbackRef.current);
  }, []);

  const finalizeFocusReturn = useCallback(
    (generation: number) => {
      if (openRef.current === true || generationRef.current !== generation) return;

      if (!usableOverlayFocusTarget(document.activeElement)) focusOpener();
      openerRef.current = null;
      fallbackRef.current = null;
      capturedRef.current = false;
    },
    [focusOpener],
  );

  const onCloseAutoFocus = useCallback(
    (event: Event) => {
      event.preventDefault();
      if (openRef.current === true) return;

      focusOpener();
      const generation = generationRef.current;
      window.setTimeout(() => finalizeFocusReturn(generation), 50);
    },
    [finalizeFocusReturn, focusOpener],
  );

  return { onCloseAutoFocus, onOpenAutoFocus };
}
