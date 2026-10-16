import type { RecordActivityWidgetDto, StoredRecordActivityWidget } from "./record-activity-widget.schema";
import type { RecordCalendarWidgetDto, StoredRecordCalendarWidget } from "./record-calendar-widget.schema";
import type { RecordMapWidgetDto, StoredRecordMapWidget } from "./record-map-widget.schema";
import type { RecordWidgetDto, StoredRecordWidget } from "./record-widget.schema";

export type WidgetDtoReaders = {
  chart: { read(row: StoredRecordWidget): Promise<RecordWidgetDto> };
  activityTimeline: { read(row: StoredRecordActivityWidget): Promise<RecordActivityWidgetDto> };
  calendar: { read(row: StoredRecordCalendarWidget): Promise<RecordCalendarWidgetDto> };
  map: { read(row: StoredRecordMapWidget): Promise<RecordMapWidgetDto> };
};
