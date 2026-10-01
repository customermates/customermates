"use client";

import { observer } from "mobx-react-lite";
import type { RecordEditorStore } from "./record-editor.store";
import type { RecordField } from "@/features/records/record-model.schema";
import { EntityDetailStaticField } from "@/components/entity-detail/entity-detail-static-field";
import { RecordValue } from "./record-value";
import { RecordDetailField } from "./record-detail-field";
import { RecordInputField } from "./record-input-field";

export const RecordEditorField = observer(function RecordEditorField({
  store,
  field,
}: {
  store: RecordEditorStore;
  field: RecordField;
}) {
  const id = `values.${field.id}`;
  if (field.behavior.kind !== "input" && !(field.behavior.kind === "snapshot" && field.behavior.allowManualOverride)) {
    return store.record ? (
      <EntityDetailStaticField
        fieldId={field.id}
        label={field.label}
        value={
          <RecordValue field={field} result={store.record.fields.find((value) => value.fieldId === field.id)?.result} />
        }
      />
    ) : null;
  }
  if (field.valueType === "richText") return <RecordInputField field={field} id={id} />;
  return (
    <RecordDetailField fieldId={field.id} inputId={id} label={field.label} required={field.required}>
      <RecordInputField field={field} id={id} label={null} />
    </RecordDetailField>
  );
});

export const RecordEditorFields = observer(function RecordEditorFields({
  store,
  notes = false,
}: {
  store: RecordEditorStore;
  notes?: boolean;
}) {
  return (
    <div className="space-y-4">
      {store.fields
        .filter((field) => (field.valueType === "richText") === notes)
        .map((field) => (
          <RecordEditorField key={field.id} field={field} store={store} />
        ))}
    </div>
  );
});
