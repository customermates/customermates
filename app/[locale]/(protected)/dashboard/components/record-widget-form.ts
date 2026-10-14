import type { SavedRecordActivityWidgetInput } from "@/features/widget/record-activity-widget.schema";
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
