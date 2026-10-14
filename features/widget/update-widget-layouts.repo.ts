import type { SavedWidgetLayout } from "./update-widget-layouts.interactor";
import type { WidgetLayout } from "./widget-display.schema";
import type { WidgetPlacementRow } from "./widget-placement";

export type WidgetLayoutTarget = WidgetPlacementRow & { version: number; viewId: string | null };
export type WidgetLayoutWrite = {
  id: string;
  expectedVersion: number;
  current: WidgetLayout | null;
  layout: WidgetLayout;
};

export abstract class UpdateWidgetLayoutsRepo {
  abstract findLayoutTargets(ids: string[]): Promise<WidgetLayoutTarget[]>;
  abstract listLayoutPlacements(viewId: string | null): Promise<WidgetPlacementRow[]>;
  abstract saveWidgetLayouts(writes: WidgetLayoutWrite[]): Promise<SavedWidgetLayout[] | null>;
}
