import type { SavedRecordActivityWidgetInput, StoredRecordActivityWidget } from "./record-activity-widget.schema";
import type { SavedRecordWidgetInput, StoredRecordWidget } from "./record-widget.schema";
import type { WidgetLayout } from "./widget-display.schema";
import type { WidgetPlacementRow } from "./widget-placement";

export type RecordWidgetKind = "chart" | "activityTimeline";
export type StoredRecordWidgetOf = { chart: StoredRecordWidget; activityTimeline: StoredRecordActivityWidget };
export type StoredWidget = { [K in RecordWidgetKind]: { kind: K; widget: StoredRecordWidgetOf[K] } }[RecordWidgetKind];
export type SavedRecordWidgetOf = { chart: SavedRecordWidgetInput; activityTimeline: SavedRecordActivityWidgetInput };

export interface RecordWidgetStoreRepo {
  findOwnedRecordWidget<K extends RecordWidgetKind>(kind: K, id: string): Promise<StoredRecordWidgetOf[K] | null>;
  findReadableRecordWidget<K extends RecordWidgetKind>(kind: K, id: string): Promise<StoredRecordWidgetOf[K] | null>;
  listLayoutPlacements(viewId: string | null): Promise<WidgetPlacementRow[]>;
  saveRecordWidget<K extends RecordWidgetKind>(
    kind: K,
    input: SavedRecordWidgetOf[K],
    id: string,
    viewId: string | null,
    layout?: WidgetLayout,
  ): Promise<StoredRecordWidgetOf[K]>;
}
