"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import type { RecordFieldView, RecordMember } from "@/features/records/record-model.schema";
import { useAppForm } from "@/components/forms/form-context";
import { FormInput } from "@/components/forms/form-input";
import { FormDecimalInput } from "@/components/forms/form-decimal-input";
import { FormTextarea } from "@/components/forms/form-textarea";
import { FormSelect } from "@/components/forms/form-select";
import { FormAutocomplete } from "@/components/forms/form-autocomplete";
import { FormAutocompleteItem } from "@/components/forms/form-autocomplete-item";
import { AppChip } from "@/components/chip/app-chip";
import { ContactValueActions } from "@/components/records/contact-value";
import { FormAutocompleteAvatar } from "@/components/forms/form-autocomplete-avatar";
import { FormAutocompleteCountry } from "@/components/forms/form-autocomplete-country";
import { FormSwitch } from "@/components/forms/form-switch";
import { FormIsoDatePicker } from "@/components/forms/form-iso-date-picker";
import { FormIsoDateRangePicker } from "@/components/forms/form-iso-date-range-picker";
import { toChipColor } from "@/constants/chip-colors";
import { FormattedTextField } from "@/components/editor/formatted-text-field";
import { useRootStore } from "@/core/stores/root-store.provider";
import { getActiveUsersAction } from "@/app/[locale]/(protected)/settings/(workspace)/actions";

type KnownMember = Pick<RecordMember, "id" | "firstName" | "lastName"> & { avatarUrl?: string | null };

export function knownMembers(
  members: RecordMember[],
  viewer: KnownMember | null | undefined,
  value: unknown,
): KnownMember[] {
  const known = new Map<string, KnownMember>(
    members.filter((member) => member.id === value).map((member) => [member.id, member]),
  );
  if (viewer && !known.has(viewer.id)) known.set(viewer.id, viewer);
  return [...known.values()];
}

export const RecordInputField = observer(function RecordInputField({
  field,
  id,
  inputId,
  label = field.label,
  members = [],
  onDatePicked,
}: {
  field: RecordFieldView;
  id: string;
  inputId?: string;
  label?: string | null;
  members?: RecordMember[];
  onDatePicked?: () => void;
}) {
  const t = useTranslations();
  const store = useAppForm();
  const root = useRootStore();
  const shared = { id, inputId, label, required: field.required };
  if (field.valueType === "richText") {
    const editor = (
      <FormattedTextField
        data={store?.getValue(id) as object | undefined}
        label={label ?? field.label}
        readOnly={Boolean(store?.isReadOnly || store?.isLoading)}
        onChange={(value) => store?.onChange(id, value)}
      />
    );
    return label ? (
      <div className="space-y-1.5">
        <span className="text-xs text-muted-foreground">{label}</span>

        {editor}
      </div>
    ) : (
      editor
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
        getItems={getActiveUsersAction}
        items={knownMembers(members, root.userStore.user, store?.getValue(id))}
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
  if (field.valueType === "file") {
    return (
      <div className="space-y-1.5">
        {label && <p className="text-xs text-muted-foreground">{label}</p>}

        <p className="text-sm text-muted-foreground">{t("RecordModel.fileUploadUnavailable")}</p>
      </div>
    );
  }
  if (field.valueType === "address") {
    return (
      <div aria-label={label ?? field.label} className="space-y-2" role="group">
        {label && (
          <p className="text-xs text-muted-foreground">
            {label}

            {field.required ? <span className="text-destructive"> *</span> : null}
          </p>
        )}

        <FormInput id={`${id}.street`} label={t("RecordModel.addressParts.street")} />

        <FormInput id={`${id}.line2`} label={t("RecordModel.addressParts.line2")} />

        <div className="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)] gap-2">
          <FormInput id={`${id}.postalCode`} label={t("RecordModel.addressParts.postalCode")} />

          <FormInput id={`${id}.city`} label={t("RecordModel.addressParts.city")} />
        </div>

        <FormInput id={`${id}.region`} label={t("RecordModel.addressParts.region")} />

        <FormAutocompleteCountry id={`${id}.countryCode`} label={t("RecordModel.addressParts.country")} />
      </div>
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
