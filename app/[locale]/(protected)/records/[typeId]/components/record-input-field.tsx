"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import type { RecordField } from "@/features/records/record-model.schema";
import { useAppForm } from "@/components/forms/form-context";
import { FormInput } from "@/components/forms/form-input";
import { FormDecimalInput } from "@/components/forms/form-decimal-input";
import { FormTextarea } from "@/components/forms/form-textarea";
import { FormSelect } from "@/components/forms/form-select";
import { FormAutocompleteAvatar } from "@/components/forms/form-autocomplete-avatar";
import { FormSwitch } from "@/components/forms/form-switch";
import { FormIsoDatePicker } from "@/components/forms/form-iso-date-picker";
import { FormIsoDateRangePicker } from "@/components/forms/form-iso-date-range-picker";
import { Editor } from "@/components/editor/editor";
import { useRootStore } from "@/core/stores/root-store.provider";
import { getUsersAction } from "../../../company/actions";

export const RecordInputField = observer(function RecordInputField({
  field,
  id,
  inputId,
  label = field.label,
}: {
  field: RecordField;
  id: string;
  inputId?: string;
  label?: string | null;
}) {
  const t = useTranslations();
  const store = useAppForm();
  const root = useRootStore();
  const shared = { id, inputId, label, required: field.required };
  if (field.valueType === "richText") {
    return (
      <div className="space-y-1.5">
        {label && <span className="text-xs text-muted-foreground">{label}</span>}

        <Editor
          data={store?.getValue(id) as object | undefined}
          label={label ?? field.label}
          readOnly={Boolean(store?.isReadOnly || store?.isLoading)}
          onChange={(value) => store?.onChange(id, value)}
        />
      </div>
    );
  }
  if (field.valueType === "select") {
    return (
      <FormSelect
        {...shared}
        items={field.options.map((option) => ({
          value: option.id,
          label: option.label,
        }))}
      />
    );
  }
  if (field.valueType === "boolean") return <FormSwitch {...shared} />;
  if (field.valueType === "member") {
    return (
      <FormAutocompleteAvatar
        {...shared}
        ariaLabel={label ?? field.label}
        getItems={getUsersAction}
        items={root.userStore.user ? [root.userStore.user] : []}
      />
    );
  }
  if (field.valueType === "date" || field.valueType === "dateTime")
    return <FormIsoDatePicker {...shared} dateOnly={field.valueType === "date"} />;

  if (field.valueType === "dateRange" || field.valueType === "dateTimeRange")
    return <FormIsoDateRangePicker {...shared} dateOnly={field.valueType === "dateRange"} />;

  if (field.multiple) return <FormTextarea {...shared} placeholder={t("RecordModel.onePerLine")} />;
  if (field.valueType === "number" || field.valueType === "currency") {
    return (
      <FormDecimalInput
        {...shared}
        endContent={
          field.valueType === "currency"
            ? (field.format?.currency ?? root.companyStore.company?.currency ?? "").toUpperCase() || undefined
            : undefined
        }
      />
    );
  }
  return <FormInput {...shared} />;
});
