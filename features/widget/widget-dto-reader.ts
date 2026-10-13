import type { StoredWidget } from "./record-widget-store.repo";
import type { WidgetDto } from "./widget.schema";
import type { WidgetDtoReaders } from "./widget-dto-readers";

export class WidgetDtoReader {
  constructor(private readonly readers: () => WidgetDtoReaders) {}

  read(stored: StoredWidget): Promise<WidgetDto> {
    return stored.kind === "activityTimeline"
      ? this.readers().activityTimeline.read(stored.widget)
      : this.readers().chart.read(stored.widget);
  }
}
