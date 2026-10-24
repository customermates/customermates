import type { StoredWidget } from "./record-widget-store.repo";
import type { WidgetDto } from "./widget.schema";
import type { WidgetDtoReaders } from "./widget-dto-readers";

export class WidgetDtoReader {
  constructor(private readonly readers: () => WidgetDtoReaders) {}

  read(stored: StoredWidget): Promise<WidgetDto> {
    switch (stored.kind) {
      case "activityTimeline":
        return this.readers().activityTimeline.read(stored.widget);
      case "calendar":
        return this.readers().calendar.read(stored.widget);
      case "map":
        return this.readers().map.read(stored.widget);
      default:
        return this.readers().chart.read(stored.widget);
    }
  }
}
