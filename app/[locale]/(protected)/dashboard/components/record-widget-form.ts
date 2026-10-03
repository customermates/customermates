import type { RecordActivityWidgetInput } from "@/features/widget/record-activity-widget.schema";
import type { RecordWidgetInput } from "@/features/widget/record-widget.schema";
import type { WidgetModalForm } from "./widget-modal.store";

export type RecordWidgetForm = RecordWidgetInput & { kind: "chart"; contractVersion: 2 };
export function isRecordWidgetForm(form: WidgetModalForm): form is RecordWidgetForm {
  return form.kind === "chart" && "contractVersion" in form && form.contractVersion === 2;
}

export type RecordActivityWidgetForm = RecordActivityWidgetInput & {
  kind: "activityTimeline";
  contractVersion: 2;
};
export function isRecordActivityWidgetForm(form: WidgetModalForm): form is RecordActivityWidgetForm {
  return form.kind === "activityTimeline" && "contractVersion" in form && form.contractVersion === 2;
}
