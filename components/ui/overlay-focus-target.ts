export type OverlayFocusTarget = {
  elementRef: WeakRef<HTMLElement>;
  id: string | null;
};

function focusCandidate(element: Element | null) {
  return typeof HTMLElement !== "undefined" &&
    element instanceof HTMLElement &&
    element !== document.body &&
    element !== document.documentElement
    ? element
    : null;
}

export function usableOverlayFocusTarget(element: Element | null) {
  const candidate = focusCandidate(element);
  if (!candidate?.isConnected || candidate.getClientRects().length === 0) return null;
  if (candidate.matches(":disabled, [aria-disabled='true']")) return null;
  if (candidate.closest("[inert], [data-overlay-surface][data-state='closed']")) return null;
  return candidate;
}

export function captureOverlayFocusTarget(element: Element | null): OverlayFocusTarget | null {
  const candidate = focusCandidate(element);
  return candidate ? { elementRef: new WeakRef(candidate), id: candidate.id || null } : null;
}

export function resolveOverlayFocusTarget(target: OverlayFocusTarget | null) {
  const element = usableOverlayFocusTarget(target?.elementRef.deref() ?? null);
  if (element) return element;

  const replacement = target?.id ? document.getElementById(target.id) : null;
  return usableOverlayFocusTarget(replacement);
}

export function focusOverlayTarget(...targets: (OverlayFocusTarget | null)[]) {
  for (const target of targets) {
    const element = resolveOverlayFocusTarget(target);
    if (!element) continue;
    element.focus({ preventScroll: true });
    return true;
  }
  return false;
}
