"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import type { RecordFieldView } from "@/features/records/record-model.schema";
import { useAppForm } from "@/components/forms/form-context";
import { FormInput } from "@/components/forms/form-input";
import { FormDecimalInput } from "@/components/forms/form-decimal-input";
import { FormTextarea } from "@/components/forms/form-textarea";
import { FormSelect } from "@/components/forms/form-select";
import { FormAutocomplete } from "@/components/forms/form-autocomplete";
import { FormAutocompleteItem } from "@/components/forms/form-autocomplete-item";
import { AppChip } from "@/components/chip/app-chip";
import { ContactValueActions } from "@/components/shared/contact-value";
import { FormAutocompleteAvatar } from "@/components/forms/form-autocomplete-avatar";
import { FormSwitch } from "@/components/forms/form-switch";
import { FormIsoDatePicker } from "@/components/forms/form-iso-date-picker";
import { FormIsoDateRangePicker } from "@/components/forms/form-iso-date-range-picker";
import { toChipColor } from "@/constants/chip-colors";
import { Editor } from "@/components/editor/editor";
import { useRootStore } from "@/core/stores/root-store.provider";
import { getUsersAction } from "../../../company/actions";

export const RecordInputField = observer(function RecordInputField({
  field,
  id,
  inputId,
  label = field.label,
  onDatePicked,
}: {
  field: RecordFieldView;
  id: string;
  inputId?: string;
  label?: string | null;
  onDatePicked?: () => void;
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
  if (field.valueType === "select" && field.multiple) {
    const options = field.options.map((option) => ({
      id: option.id,
      label: option.label,
      color: toChipColor(option.color),
    }));
    return (
      <FormAutocomplete
        {...shared}
        ariaLabel={label ?? field.label}
        items={options}
        renderValue={(selected) =>
          selected.map((entry) => (
            <AppChip key={entry.key} variant={entry.data?.color ?? "secondary"}>
              {entry.data?.label ?? t("RecordModel.unavailableOption")}
            </AppChip>
          ))
        }
        selectionMode="multiple"
      >
        {(option) =>
          FormAutocompleteItem({
            textValue: option.label,
            children: <AppChip variant={option.color}>{option.label}</AppChip>,
          })
        }
      </FormAutocomplete>
    );
  }
  if (field.valueType === "select") {
    return (
      <FormSelect
        {...shared}
        items={field.options.map((option) => ({
          value: option.id,
          label: option.label,
          color: toChipColor(option.color),
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
    return <FormIsoDatePicker {...shared} dateOnly={field.valueType === "date"} onPicked={onDatePicked} />;

  if (field.valueType === "dateRange" || field.valueType === "dateTimeRange")
    return <FormIsoDateRangePicker {...shared} dateOnly={field.valueType === "dateRange"} />;

  if (field.multiple) return <FormTextarea {...shared} placeholder={t("RecordModel.onePerLine")} />;
  if (field.valueType === "number" || field.valueType === "currency") {
    return (
      <FormDecimalInput
        {...shared}
        endContent={field.valueType === "currency" ? (field.format?.currency ?? undefined) : undefined}
      />
    );
  }
  if (field.valueType === "email" || field.valueType === "phone" || field.valueType === "url") {
    const value = store?.getValue(id);
    return (
      <FormInput
        {...shared}
        className="pr-14"
        endContent={
          typeof value === "string" && value.trim() ? (
            <ContactValueActions action={field.format?.onClick ?? "open"} kind={field.valueType} value={value} />
          ) : undefined
        }
      />
    );
  }
  return <FormInput {...shared} />;
});
