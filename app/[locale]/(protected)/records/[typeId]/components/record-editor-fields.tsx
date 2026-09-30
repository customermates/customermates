"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import type { RecordEditorStore } from "./record-editor.store";
import type { RecordField } from "@/features/records/record-model.schema";
import { FormInput } from "@/components/forms/form-input";
import { FormTextarea } from "@/components/forms/form-textarea";
import { FormSelect } from "@/components/forms/form-select";
import { FormAutocompleteAvatar } from "@/components/forms/form-autocomplete-avatar";
import { FormSwitch } from "@/components/forms/form-switch";
import { FormIsoDatePicker } from "@/components/forms/form-iso-date-picker";
import { FormIsoDateRangePicker } from "@/components/forms/form-iso-date-range-picker";
import { Editor } from "@/components/editor/editor";
import { EntityDetailStaticField } from "@/components/entity-detail/entity-detail-static-field";
import { RecordValue } from "./record-value";
import { RecordDetailField } from "./record-detail-field";
import { getUsersAction } from "../../../company/actions";

export const RecordEditorField = observer(function RecordEditorField({
  store,
  field,
}: {
  store: RecordEditorStore;
  field: RecordField;
}) {
  const t = useTranslations();
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
  if (field.valueType === "richText") {
    return (
      <div className="space-y-1.5">
        <span className="text-xs text-muted-foreground">{field.label}</span>

        <Editor
          data={store.form.values[field.id] as object | undefined}
          label={field.label}
          readOnly={store.isReadOnly}
          onChange={(value) => store.onChange(id, value)}
        />
      </div>
    );
  }
  let control;
  const shared = { id, label: null, required: field.required };
  if (field.valueType === "select") {
    control = (
      <FormSelect {...shared} items={field.options.map((option) => ({ value: option.id, label: option.label }))} />
    );
  } else if (field.valueType === "boolean") control = <FormSwitch {...shared} />;
  else if (field.valueType === "member") {
    control = (
      <FormAutocompleteAvatar
        {...shared}
        ariaLabel={field.label}
        getItems={getUsersAction}
        items={store.rootStore.userStore.user ? [store.rootStore.userStore.user] : []}
      />
    );
  } else if (field.valueType === "date" || field.valueType === "dateTime")
    control = <FormIsoDatePicker {...shared} dateOnly={field.valueType === "date"} />;
  else if (field.valueType === "dateRange" || field.valueType === "dateTimeRange")
    control = <FormIsoDateRangePicker {...shared} dateOnly={field.valueType === "dateRange"} />;
  else if (field.multiple) control = <FormTextarea {...shared} placeholder={t("RecordModel.onePerLine")} />;
  else {
    control = (
      <FormInput
        {...shared}
        inputMode={field.valueType === "number" || field.valueType === "currency" ? "decimal" : undefined}
      />
    );
  }
  return (
    <RecordDetailField fieldId={field.id} inputId={id} label={field.label} required={field.required}>
      {control}
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
