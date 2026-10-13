import type { RecordActivityWidgetDto, StoredRecordActivityWidget } from "./record-activity-widget.schema";
import type { RecordWidgetDto, StoredRecordWidget } from "./record-widget.schema";

export type WidgetDtoReaders = {
  chart: { read(row: StoredRecordWidget): Promise<RecordWidgetDto> };
  activityTimeline: { read(row: StoredRecordActivityWidget): Promise<RecordActivityWidgetDto> };
};
