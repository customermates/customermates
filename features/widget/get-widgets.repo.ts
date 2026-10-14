import type { StoredWidget } from "./record-widget-store.repo";

export abstract class GetWidgetsRepo {
  abstract getWidgets(viewId?: string | null): Promise<StoredWidget[]>;
}
