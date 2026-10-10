"use client";

import { withFormulaReferences } from "@/features/records/formula-references";
import { useId } from "react";
import { observer } from "mobx-react-lite";
import { isRecordFieldWritable } from "@/features/records/record-input-value";
import { useTranslations } from "next-intl";
import { Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { RecordEditorStore } from "./record-editor.store";
import type { RecordFieldView } from "@/features/records/record-model.schema";
import { EntityDetailStaticField } from "@/components/entity-detail/entity-detail-static-field";
import { RecordValue, useRecordValueFormat } from "./record-value";
import { RecordDetailField } from "./record-detail-field";
import { RecordInputField } from "./record-input-field";
import { FormattedTextField } from "@/components/editor/formatted-text-field";
import { ConfirmationSentenceView, referenceSentence } from "@/components/modal/confirmation-sentence";
import { RecordIdentityEditor } from "./record-identity-editor";
import { recordValueSource } from "@/features/records/record-value-source";
import { recordDisplayName } from "@/features/records/record-display-name";
import { runUserAction } from "@/core/errors/report-application-error";

export const RecordEditorField = observer(function RecordEditorField({
  store,
  field,
}: {
  store: RecordEditorStore;
  field: RecordFieldView;
}) {
  const t = useTranslations();
  const valueFormat = useRecordValueFormat();
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
  if (field.valueType === "channels") return <RecordIdentityEditor field={field} store={store} />;
  if (restricted || !isRecordFieldWritable(field)) {
    if (!store.record) return null;
    if (result?.state === "value" && result.value.kind === "richText") {
      return (
        <RecordDetailField action={captureAction} fieldId={field.id} label={field.label}>
          <FormattedTextField readOnly data={JSON.parse(result.value.documentJson) as object} label={field.label} />
        </RecordDetailField>
      );
    }
    const source = restricted
      ? null
      : recordValueSource({
          model: withFormulaReferences(store.presentation.model, store.presentation.formulaReferences),
          field,
          t,
          format: valueFormat,
        });
    const lookup = source?.lookup;
    const linked = lookup
      ? store.record.relationships.find(
          (summary) => summary.relationId === lookup.relationId && summary.direction === lookup.direction,
        )?.records
      : undefined;
    const target = linked?.length === 1 ? linked[0] : null;
    const targetName = target
      ? recordDisplayName(target.title, store.presentation.linkLabels[target.ref.typeId], t)
      : field.label;
    return (
      <EntityDetailStaticField
        action={restricted ? null : captureAction}
        fieldId={field.id}
        label={field.label}
        source={
          source ? (
            <ConfirmationSentenceView
              sentence={referenceSentence(source.segments, (reference) =>
                reference.kind === "list" && target
                  ? {
                      label: t("RecordModel.openRecord", { name: targetName }),
                      onOpen: (trigger) =>
                        runUserAction(() => store.rootStore.recordWorkspaceStore.open(target.ref, trigger)),
                    }
                  : null,
              )}
            />
          ) : undefined
        }
        value={<RecordValue field={field} members={store.record.memberUsers} result={result} />}
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
