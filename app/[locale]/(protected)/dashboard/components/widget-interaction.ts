export const WIDGET_INTERACTIVE_ATTRIBUTE = "data-widget-interactive";

export const WIDGET_INTERACTIVE_SELECTOR = `[${WIDGET_INTERACTIVE_ATTRIBUTE}]`;

export const WIDGET_CLICK_MOVEMENT_TOLERANCE = 8;

type WidgetEditorStore = {
  loadById: (id: string) => Promise<void> | void;
  setExpandedFilterField: (field: string | undefined) => void;
  setExpandedSection: (section: string) => void;
};

export function openWidgetEditor(store: WidgetEditorStore, id: string): void {
  store.setExpandedSection("config");
  store.setExpandedFilterField(undefined);
  void store.loadById(id);
}

export function isInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(WIDGET_INTERACTIVE_SELECTOR) !== null;
}

export function isWidgetOpeningClick(args: {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  startedOnInteractive: boolean;
  tolerance?: number;
}): boolean {
  if (args.startedOnInteractive) return false;

  const tolerance = args.tolerance ?? WIDGET_CLICK_MOVEMENT_TOLERANCE;

  return Math.abs(args.endX - args.startX) < tolerance && Math.abs(args.endY - args.startY) < tolerance;
}
