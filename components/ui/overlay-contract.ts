import { buttonVariants } from "./button";

export const OVERLAY_COLLISION_PADDING = 8;

export const OVERLAY_RAISED_PANEL_LAYER_CLASS = "z-[60]";

export const OVERLAY_TOPMOST_LAYER_CLASS = "z-[70]";

export const OVERLAY_CLOSE_POSITION_CLASS = "top-[1.375rem] right-2";

export const OVERLAY_SAFE_CLOSE_POSITION_CLASS =
  "top-[calc(1.375rem+var(--safe-top))] right-[calc(0.5rem+var(--safe-right))]";

export const OVERLAY_DRAWER_HANDLE_CLOSE_CLASS =
  "group-data-[vaul-drawer-direction=bottom]/drawer-content:top-[2.875rem] group-data-[overlay-actions]/drawer-content:top-[1.375rem]!";

export const OVERLAY_ACTION_RAIL_CLASS = "absolute top-[1.375rem] right-12 z-10 flex min-h-8 items-center gap-2";

export type OverlayIconControlVariant = "neutral" | "destructive";

export function overlayIconControlClass(variant: OverlayIconControlVariant = "neutral") {
  return buttonVariants({
    variant: variant === "destructive" ? "ghostDestructive" : "ghost",
    size: "icon-sm",
    className: variant === "neutral" ? "text-muted-foreground" : undefined,
  });
}

export const OVERLAY_CLOSE_CLASS = `absolute ${overlayIconControlClass()}`;

export const OVERLAY_HEADER_ALIGNMENT_CLASS = "text-left";

export const OVERLAY_SCROLL_REGION = "min-h-0 flex-1 overflow-y-auto overscroll-contain";
