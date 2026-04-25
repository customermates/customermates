"use client";

import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";

import { Mail, Phone } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { CustomColumnType } from "@/generated/prisma";

import { AppChip } from "@/components/chip/app-chip";
import { FormInput } from "@/components/forms/form-input";
import { FormSelect } from "@/components/forms/form-select";
import { FormInputChips } from "@/components/forms/form-input-chips";
import { FormNumberInput } from "@/components/forms/form-number-input";
import { FormIsoDatePicker } from "@/components/forms/form-iso-date-picker";
import { Icon } from "@/components/shared/icon";
import { Favicon } from "@/components/shared/favicon";
import { copyToClipboard } from "@/lib/clipboard";
import { useRootStore } from "@/core/stores/root-store.provider";

type Props = {
  column: CustomColumnDto;
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  id?: string;
  label?: string | null;
  hideLabel?: boolean;
};

function formStringToNumber(value: string | undefined): number | undefined {
  if (value === undefined || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export const CustomFieldEditor = observer(function CustomFieldEditor({
  column,
  value,
  onChange,
  id,
  label,
  hideLabel = false,
}: Props) {
  const t = useTranslations("");
  const { intlStore } = useRootStore();

  async function handleCopy(val: string) {
    const ok = await copyToClipboard(val);
    if (ok) toast.success(t("Common.notifications.copiedToClipboard", { value: val }));
    else toast.error(t("Common.notifications.copyFailed"));
  }

  const inputId = `custom-field-editor-${column.id}`;
  const resolvedLabel = label === undefined ? column.label : label;
  const formLabel: string | null | undefined = hideLabel ? null : (resolvedLabel ?? t("Common.inputs." + inputId));

  switch (column.type) {
    case CustomColumnType.singleSelect:
      return (
        <FormSelect
          id={id ?? inputId}
          items={(column.options?.options ?? []).map((opt) => ({
            value: opt.value,
            label: opt.label,
            color: opt.color,
          }))}
          label={formLabel}
        />
      );

    case CustomColumnType.link:
      return (
        <FormInputChips
          allowMultiple={column.options?.allowMultiple}
          chipColor={column.options?.color}
          id={id ?? inputId}
          label={formLabel}
          renderChip={(url, endContent) => {
            let startContent: React.ReactNode;
            let displayLabel: string;

            try {
              const parsedUrl = new URL(url);
              if (parsedUrl.protocol === "mailto:") {
                displayLabel = parsedUrl.pathname;
                startContent = (
                  <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground">
                    <Icon icon={Mail} size="md" />
                  </span>
                );
              } else if (parsedUrl.protocol === "tel:") {
                displayLabel = parsedUrl.pathname;
                startContent = (
                  <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground">
                    <Icon icon={Phone} size="md" />
                  </span>
                );
              } else {
                displayLabel = parsedUrl.hostname;
                startContent = <Favicon className="rounded-full" size={16} value={url} />;
              }
            } catch {
              displayLabel = url;
              startContent = <Favicon className="rounded-full" size={16} value={url} />;
            }

            return (
              <AppChip
                endContent={endContent}
                startContent={startContent}
                variant={column.options?.color ? column.options.color : "secondary"}
              >
                {displayLabel}
              </AppChip>
            );
          }}
          value={value}
          onChipClick={(url) => window.open(url, "_blank", "noreferrer")}
          onValueChange={onChange}
        />
      );

    case CustomColumnType.currency:
      return (
        <FormNumberInput
          hideStepper
          endContent={
            column.options?.currency && (
              <span className="mr-1.5">
                {intlStore.formatCurrency(0, column.options?.currency?.toString()).replace(/[\d\s,.-]/g, "")}
              </span>
            )
          }
          id={id ?? inputId}
          label={formLabel}
          value={formStringToNumber(value)}
          onValueChange={(n) => onChange(n === undefined ? undefined : String(n))}
        />
      );

    case CustomColumnType.plain:
      return <FormInput id={id ?? inputId} label={formLabel} />;

    case CustomColumnType.date:
      return (
        <FormIsoDatePicker
          dateOnly
          displayFormat={column.options?.displayFormat ?? undefined}
          id={id ?? inputId}
          label={formLabel}
        />
      );

    case CustomColumnType.dateTime:
      return (
        <FormIsoDatePicker
          dateOnly={false}
          displayFormat={column.options?.displayFormat ?? undefined}
          id={id ?? inputId}
          label={formLabel}
        />
      );

    case CustomColumnType.email:
      return (
        <FormInputChips
          allowMultiple={column.options?.allowMultiple}
          chipColor={column.options?.color}
          id={id ?? inputId}
          label={formLabel}
          value={value}
          onChipClick={(val) => void handleCopy(val)}
          onValueChange={onChange}
        />
      );

    case CustomColumnType.phone:
      return (
        <FormInputChips
          allowMultiple={column.options?.allowMultiple}
          chipColor={column.options?.color}
          id={id ?? inputId}
          label={formLabel}
          value={value}
          onChipClick={(val) => void handleCopy(val)}
          onValueChange={onChange}
        />
      );
  }

  return null;
});
