import type { RecordActivityWidgetReader } from "./record-activity-widget-reader";
import type { StoredWidget } from "./record-widget-store.repo";
import type { RecordWidgetReader } from "./record-widget-reader";
import type { WidgetDto } from "./widget.schema";

export class WidgetDtoReader {
  constructor(
    private charts: RecordWidgetReader,
    private activities: RecordActivityWidgetReader,
  ) {}

  read(stored: StoredWidget): Promise<WidgetDto> {
    return stored.kind === "activityTimeline" ? this.activities.read(stored.widget) : this.charts.read(stored.widget);
  }
}
