"use client";

import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
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
import { RecordIdentityEditor } from "./record-identity-editor";
import { CalculationSentenceText } from "@/components/records/calculation-sentence-text";
import { recordValueSource } from "@/features/records/record-value-source";
import { runUserAction } from "@/core/errors/report-application-error";

export const RecordEditorField = observer(function RecordEditorField({
  store,
  field,
}: {
  store: RecordEditorStore;
  field: RecordFieldView;
}) {
  const t = useTranslations();
  const intl = useHydratedIntlStore();
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
    const source = restricted
      ? null
      : recordValueSource({ model: store.presentation.model, field, t, locale: intl.formattingLocale });
    const lookup = source?.lookup;
    const linked = lookup
      ? store.record.relationships.find(
          (summary) => summary.relationId === lookup.relationId && summary.direction === lookup.direction,
        )?.records
      : undefined;
    const target = linked?.length === 1 ? linked[0] : null;
    const targetName =
      target?.title.state === "value" && target.title.value.kind === "text" ? target.title.value.value : field.label;
    return (
      <EntityDetailStaticField
        action={restricted ? null : captureAction}
        fieldId={field.id}
        label={field.label}
        source={
          source ? (
            <CalculationSentenceText
              action={(reference) =>
                reference.kind === "list" && target
                  ? {
                      label: t("RecordModel.openRecord", { name: targetName }),
                      onOpen: (trigger) =>
                        runUserAction(() => store.rootStore.recordWorkspaceStore.open(target.ref, trigger)),
                    }
                  : null
              }
              segments={source.segments}
            />
          ) : undefined
        }
        value={<RecordValue field={field} members={store.record.memberUsers} result={result} />}
      />
    );
  }
  if (field.valueType === "richText") {
    return (
      <div className="space-y-1.5">
        {captureAction}

        <RecordInputField field={field} id={id} />
      </div>
    );
  }
  return (
    <RecordDetailField
      action={captureAction}
      fieldId={field.id}
      inputId={inputId}
      label={field.label}
      required={field.required}
    >
      <RecordInputField field={field} id={id} inputId={inputId} label={null} />
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
