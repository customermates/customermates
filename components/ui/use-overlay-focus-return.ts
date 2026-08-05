"use client";

import { useCallback, useRef } from "react";

function focusCandidate(element: Element | null) {
  return typeof HTMLElement !== "undefined" &&
    element instanceof HTMLElement &&
    element !== document.body &&
    element !== document.documentElement
    ? element
    : null;
}

function visibleFocusCandidate(element: HTMLElement | null) {
  return element?.isConnected && element.getClientRects().length > 0 ? element : null;
}

export function useOverlayFocusReturn(
  open?: boolean,
  preferredOpener?: HTMLElement | null,
  fallbackOpener?: HTMLElement | null,
) {
  const openRef = useRef(open);
  const previousOpenRef = useRef(open);
  const openerRef = useRef<HTMLElement | null>(null);
  const openerIdRef = useRef<string | null>(null);
  const fallbackRef = useRef<HTMLElement | null>(null);
  const fallbackIdRef = useRef<string | null>(null);
  const capturedRef = useRef(false);
  const generationRef = useRef(0);

  const captureOpener = useCallback((element: Element | null, fallback?: HTMLElement | null) => {
    const opener = focusCandidate(element);
    openerRef.current = opener;
    openerIdRef.current = opener?.id || null;
    fallbackRef.current = focusCandidate(fallback ?? null);
    fallbackIdRef.current = fallbackRef.current?.id || null;
    capturedRef.current = Boolean(opener || fallbackRef.current);
  }, []);

  if (open === true && previousOpenRef.current !== true) {
    generationRef.current += 1;
    captureOpener(
      preferredOpener?.isConnected ? preferredOpener : typeof document === "undefined" ? null : document.activeElement,
      fallbackOpener,
    );
  }

  openRef.current = open;
  previousOpenRef.current = open;

  const onOpenAutoFocus = useCallback(() => {
    if (capturedRef.current) return;

    captureOpener(preferredOpener?.isConnected ? preferredOpener : document.activeElement, fallbackOpener);
  }, [captureOpener, fallbackOpener, preferredOpener]);

  const resolveCandidate = useCallback((element: HTMLElement | null, id: string | null) => {
    const connected = visibleFocusCandidate(element);
    if (connected) return connected;

    const replacement = id ? document.getElementById(id) : null;
    return visibleFocusCandidate(replacement);
  }, []);

  const resolveOpener = useCallback(
    () =>
      resolveCandidate(openerRef.current, openerIdRef.current) ??
      resolveCandidate(fallbackRef.current, fallbackIdRef.current),
    [resolveCandidate],
  );

  const focusOpener = useCallback(() => {
    if (openRef.current === true) return;

    const opener = resolveOpener();
    if (opener) {
      openerRef.current = opener;
      opener.focus({ preventScroll: true });
    }
  }, [resolveOpener]);

  const finalizeFocusReturn = useCallback(
    (generation: number) => {
      if (openRef.current === true || generationRef.current !== generation) return;

      const activeElement = focusCandidate(document.activeElement);
      if (!activeElement?.isConnected) focusOpener();
      openerRef.current = null;
      openerIdRef.current = null;
      fallbackRef.current = null;
      fallbackIdRef.current = null;
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
