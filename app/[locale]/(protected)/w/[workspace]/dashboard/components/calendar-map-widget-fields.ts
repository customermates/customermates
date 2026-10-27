import type { RecordFieldView, RecordModelView } from "@/features/records/record-model.schema";

import {
  isCalendarWidgetDateField,
  isMapAddressField,
  isMapDetailField,
  isWidgetColorField,
  isWidgetNumberField,
} from "@/features/widget/record-widget-query-validation";

type FieldModel = Pick<RecordModelView, "fields"> | null | undefined;

function sourceFields(model: FieldModel, typeId: string, accepts: (field: RecordFieldView) => boolean) {
  return model?.fields.filter((field) => field.typeId === typeId && accepts(field)) ?? [];
}

export function calendarDateFieldsOf(model: FieldModel, typeId: string) {
  return sourceFields(model, typeId, isCalendarWidgetDateField);
}

export function widgetNumberFieldsOf(model: FieldModel, typeId: string) {
  return sourceFields(model, typeId, isWidgetNumberField);
}

export function widgetColorFieldsOf(model: FieldModel, typeId: string) {
  return sourceFields(model, typeId, isWidgetColorField);
}

export function mapAddressFieldsOf(model: FieldModel, typeId: string) {
  return sourceFields(model, typeId, isMapAddressField);
}

export function mapDetailFieldsOf(model: FieldModel, typeId: string) {
  return sourceFields(model, typeId, isMapDetailField);
}
