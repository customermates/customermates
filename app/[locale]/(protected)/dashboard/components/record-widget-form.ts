import type { RecordActivityWidgetInput } from "@/features/widget/record-activity-widget.schema";
import type { RecordWidgetInput } from "@/features/widget/record-widget.schema";
import type { WidgetModalForm } from "./widget-modal.store";

export type RecordWidgetForm = RecordWidgetInput & { kind: "chart" };
export function isRecordWidgetForm(form: WidgetModalForm): form is RecordWidgetForm {
  return form.kind === "chart";
}

export type RecordActivityWidgetForm = RecordActivityWidgetInput & { kind: "activityTimeline" };
export function isRecordActivityWidgetForm(form: WidgetModalForm): form is RecordActivityWidgetForm {
  return form.kind === "activityTimeline";
}
