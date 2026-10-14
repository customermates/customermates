import type { CSSProperties, FocusEvent, SyntheticEvent } from "react";

export const ASSISTANT_SURFACE_SELECTOR = "[data-agent-surface]";
const escapesLeftToAssistant = new WeakSet<Event>();

export function keepOpenForAssistantSurface(event: Event) {
  if (!(event.target instanceof Element && event.target.closest(ASSISTANT_SURFACE_SELECTOR))) return;

  event.preventDefault();
  if (event instanceof KeyboardEvent) escapesLeftToAssistant.add(event);
}

export function claimEscapeForAssistant(event: KeyboardEvent) {
  if (event.key !== "Escape") return false;
  if (event.defaultPrevented && !escapesLeftToAssistant.delete(event)) return false;

  event.preventDefault();
  return true;
}

export function releaseFocusToAssistantSurface(event: FocusEvent) {
  if (event.relatedTarget instanceof Element && event.relatedTarget.closest(ASSISTANT_SURFACE_SELECTOR))
    event.nativeEvent.stopImmediatePropagation();
}

function keepEventInAssistantSurface(event: SyntheticEvent<HTMLElement>) {
  if (event.target instanceof Node && event.currentTarget.contains(event.target))
    event.nativeEvent.stopImmediatePropagation();
}

export function assistantSurfaceProps(style?: CSSProperties) {
  return {
    "aria-live": "off",
    "data-agent-surface": "",
    style: { ...style, pointerEvents: "auto" },
    onBlur: keepEventInAssistantSurface,
    onFocus: keepEventInAssistantSurface,
    onTouchMove: keepEventInAssistantSurface,
    onWheel: keepEventInAssistantSurface,
  } as const;
}
