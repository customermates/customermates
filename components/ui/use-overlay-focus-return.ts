"use client";

import { useCallback, useEffect, useRef } from "react";

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
  const mountedRef = useRef(false);
  const pendingReturnRef = useRef<{ view: Window; id: number } | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
      const pending = pendingReturnRef.current;
      if (pending) pending.view.clearTimeout(pending.id);
      pendingReturnRef.current = null;
    };
  }, []);

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
      if (!mountedRef.current || openRef.current === true || generationRef.current !== generation) return;

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
      if (!mountedRef.current || openRef.current === true) return;

      focusOpener();
      const generation = generationRef.current;
      const pending = pendingReturnRef.current;
      if (pending) pending.view.clearTimeout(pending.id);
      const view = window;
      const id = view.setTimeout(() => {
        pendingReturnRef.current = null;
        finalizeFocusReturn(generation);
      }, 50);
      pendingReturnRef.current = { view, id };
    },
    [finalizeFocusReturn, focusOpener],
  );

  return { onCloseAutoFocus, onOpenAutoFocus };
}
