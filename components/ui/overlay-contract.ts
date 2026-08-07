export const OVERLAY_COLLISION_PADDING = 8;

export const OVERLAY_CLOSE_POSITION_CLASS = "top-1.5 right-1.5";

export const OVERLAY_SAFE_CLOSE_POSITION_CLASS =
  "top-[calc(0.375rem+var(--safe-top))] right-[calc(0.375rem+var(--safe-right))]";

export const OVERLAY_ACTION_RAIL_CLASS = "absolute top-1.5 right-[3.125rem] z-10 flex min-h-9 items-center gap-2";

export const OVERLAY_ICON_CONTROL_CLASS =
  "grid size-9 shrink-0 place-items-center rounded-xs p-2.5 opacity-70 ring-offset-background transition-[background-color,color,opacity,transform] hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-hidden disabled:pointer-events-none disabled:opacity-40 active:scale-[0.97] motion-reduce:transition-none [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0";

export const OVERLAY_ICON_CONTROL_NEUTRAL_CLASS = "text-muted-foreground hover:bg-accent hover:text-accent-foreground";

export const OVERLAY_ICON_CONTROL_DESTRUCTIVE_CLASS =
  "text-destructive hover:bg-destructive/10 hover:text-destructive focus-visible:ring-destructive/40";

export const OVERLAY_CLOSE_CLASS = `absolute ${OVERLAY_ICON_CONTROL_CLASS} ${OVERLAY_ICON_CONTROL_NEUTRAL_CLASS}`;

export const OVERLAY_HEADER_ALIGNMENT_CLASS = "text-left";

export const OVERLAY_SCROLL_REGION = "min-h-0 flex-1 overflow-y-auto overscroll-contain";
