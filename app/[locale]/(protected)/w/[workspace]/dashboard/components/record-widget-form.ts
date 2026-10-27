import type { SavedRecordActivityWidgetInput } from "@/features/widget/record-activity-widget.schema";
import type { SavedRecordCalendarWidgetInput } from "@/features/widget/record-calendar-widget.schema";
import type { SavedRecordMapWidgetInput } from "@/features/widget/record-map-widget.schema";
import type { SavedRecordWidgetInput } from "@/features/widget/record-widget.schema";
import type { WidgetModalForm } from "./widget-modal.store";

export type RecordWidgetForm = SavedRecordWidgetInput & { kind: "chart" };
export function isRecordWidgetForm(form: WidgetModalForm): form is RecordWidgetForm {
  return form.kind === "chart";
}

export type RecordActivityWidgetForm = SavedRecordActivityWidgetInput & { kind: "activityTimeline" };
export function isRecordActivityWidgetForm(form: WidgetModalForm): form is RecordActivityWidgetForm {
  return form.kind === "activityTimeline";
}

export type RecordCalendarWidgetForm = SavedRecordCalendarWidgetInput & { kind: "calendar" };
export function isRecordCalendarWidgetForm(form: WidgetModalForm): form is RecordCalendarWidgetForm {
  return form.kind === "calendar";
}

export type RecordMapWidgetForm = SavedRecordMapWidgetInput & { kind: "map" };
export function isRecordMapWidgetForm(form: WidgetModalForm): form is RecordMapWidgetForm {
  return form.kind === "map";
}

export function recordWidgetSourceTypeId(form: WidgetModalForm): string | undefined {
  if (isRecordWidgetForm(form)) return form.measure.source.typeId;
  if (isRecordCalendarWidgetForm(form)) return form.calendarQuery.source.typeId;
  if (isRecordMapWidgetForm(form)) return form.mapQuery.source.typeId;
  return undefined;
}
