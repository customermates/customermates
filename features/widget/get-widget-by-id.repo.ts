import type { StoredWidget } from "./record-widget-store.repo";

export abstract class GetWidgetByIdRepo {
  abstract getWidgetById(id: string): Promise<StoredWidget | null>;
}
