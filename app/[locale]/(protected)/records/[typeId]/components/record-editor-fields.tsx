"use client";

import { useId } from "react";
import { observer } from "mobx-react-lite";
import { isRecordFieldWritable } from "@/features/records/record-input-value";
import { useTranslations } from "next-intl";
import { Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { RecordEditorStore } from "./record-editor.store";
import type { RecordFieldView } from "@/features/records/record-model.schema";
import { EntityDetailStaticField } from "@/components/entity-detail/entity-detail-static-field";
import { RecordValue } from "./record-value";
import { RecordDetailField } from "./record-detail-field";
import { RecordInputField } from "./record-input-field";
import { FormattedTextField } from "@/components/editor/formatted-text-field";

export const RecordEditorField = observer(function RecordEditorField({
  store,
  field,
}: {
  store: RecordEditorStore;
  field: RecordFieldView;
}) {
  const t = useTranslations();
  const id = `values.${field.id}`;
  const inputId = `${id}-${useId()}`;
  const result = store.record?.fields.find((value) => value.fieldId === field.id)?.result;
  const restricted = result?.state === "restricted";
  const captureStaged = store.form.captureFieldIds.includes(field.id);
  const captureAction =
    store.record && !store.isReadOnly && field.behavior.kind === "snapshot" && field.behavior.capture === "explicit" ? (
      <Button
        aria-label={t(captureStaged ? "RecordModel.captureOnSaveField" : "RecordModel.captureValueField", {
          field: field.label,
        })}
        aria-pressed={captureStaged}
        disabled={store.isLoading}
        size="sm"
        type="button"
        variant="ghost"
        onClick={() => store.toggleCapture(field.id)}
      >
        <Camera aria-hidden className="size-3.5" />

        {t(captureStaged ? "RecordModel.captureOnSave" : "RecordModel.captureValue")}
      </Button>
    ) : null;
  if (restricted || !isRecordFieldWritable(field)) {
    if (!store.record) return null;
    if (result?.state === "value" && result.value.kind === "richText") {
      return (
        <RecordDetailField action={captureAction} fieldId={field.id} label={field.label}>
          <FormattedTextField readOnly data={JSON.parse(result.value.documentJson) as object} label={field.label} />
        </RecordDetailField>
      );
    }
    return (
      <EntityDetailStaticField
        action={restricted ? null : captureAction}
        fieldId={field.id}
        label={field.label}
        value={<RecordValue field={field} members={store.record?.memberUsers} result={result} />}
      />
    );
  }
  return (
    <RecordDetailField
      action={captureAction}
      fieldId={field.id}
      inputId={field.valueType === "richText" ? undefined : inputId}
      label={field.label}
      required={field.required}
    >
      <RecordInputField field={field} id={id} inputId={inputId} label={null} />
    </RecordDetailField>
  );
});
