import type { UpdateWidgetLayoutsData, SavedWidgetLayout } from "./update-widget-layouts.interactor";

export abstract class UpdateWidgetLayoutsRepo {
  abstract updateWidgetLayouts(args: UpdateWidgetLayoutsData): Promise<SavedWidgetLayout[]>;
}
