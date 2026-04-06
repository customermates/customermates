"use client";

import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { SharedSelection } from "@heroui/system-rsc";

import { EnvelopeIcon, PhoneIcon } from "@heroicons/react/24/outline";
import { parseDateTime } from "@internationalized/date";
import { z } from "zod";
import { useTranslations } from "next-intl";

import { CustomColumnType } from "@/generated/prisma";

import { XFavicon } from "../../x-favicon";
import { XIcon } from "../../x-icon";

import { XInput } from "@/components/x-inputs/x-input";
import { XInputNumber } from "@/components/x-inputs/x-input-number";
import { XInputChips } from "@/components/x-inputs/x-input-chips";
import { XSelect } from "@/components/x-inputs/x-select";
import { XSelectItem } from "@/components/x-inputs/x-select-item";
import { XChip } from "@/components/x-chip/x-chip";
import { XIsoDatePicker } from "@/components/x-inputs/x-iso-date-picker";
import { useRootStore } from "@/core/stores/root-store.provider";

type Props = {
  column: CustomColumnDto;
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  id?: string;
  label?: string | null;
  isEditing?: boolean;
};

function formStringToNumber(value: string | undefined): number | undefined {
  if (value === undefined || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export function XCustomFieldEditor({ column, value, onChange, id, label, isEditing = false }: Props) {
  const t = useTranslations("Common.inputs");
  const { intlStore } = useRootStore();

  const borderClassNames = isEditing ? "rounded-r-none" : undefined;
  const inputId = `custom-field-editor-${column.id}`;
  const resolvedLabel = label === undefined ? column.label : label;

  switch (column.type) {
    case CustomColumnType.singleSelect:
      return (
        <XSelect
          isMultiline
          classNames={{
            trigger: borderClassNames,
          }}
          id={inputId}
          items={column.options?.options}
          label={resolvedLabel ?? t(inputId)}
          renderValue={(items) =>
            items.map((item) => (
              <XChip key={item.key} color={item.data?.color}>
                {item.data?.label}
              </XChip>
            ))
          }
          selectedKeys={value ? [value] : []}
          onSelectionChange={(selection: SharedSelection) => {
            if (selection === "all") return;
            const keys = Array.from(selection).map((k) => String(k));
            onChange(keys[0] ?? undefined);
          }}
        >
          {({ value, label, color }) =>
            XSelectItem({
              key: value,
              textValue: label,
              children: <XChip color={color}>{label}</XChip>,
            })
          }
        </XSelect>
      );

    case CustomColumnType.link:
      return (
        <XInputChips
          allowMultiple={column.options?.allowMultiple}
          chipColor={column.options?.color}
          classNames={{
            inputWrapper: borderClassNames,
          }}
          id={inputId}
          label={resolvedLabel ?? t(inputId)}
          renderChip={(url) => {
            let startContent: React.ReactNode;
            let displayLabel: string;

            try {
              const parsedUrl = new URL(url);
              if (parsedUrl.protocol === "mailto:") {
                displayLabel = parsedUrl.pathname;
                startContent = <XIcon className="mr-0.5" icon={EnvelopeIcon} size="sm" />;
              } else if (parsedUrl.protocol === "tel:") {
                displayLabel = parsedUrl.pathname;
                startContent = <XIcon className="mr-0.5" icon={PhoneIcon} size="sm" />;
              } else {
                displayLabel = parsedUrl.hostname;
                startContent = <XFavicon className="mr-0.5 rounded-full" value={url} />;
              }
            } catch {
              displayLabel = url;
              startContent = <XFavicon className="mr-0.5 rounded-full" value={url} />;
            }

            return (
              <XChip color={column.options?.color} startContent={startContent}>
                {displayLabel}
              </XChip>
            );
          }}
          schema={z.url()}
          value={value}
          onValueChange={onChange}
        />
      );

    case CustomColumnType.currency:
      return (
        <XInputNumber
          hideStepper
          classNames={{
            inputWrapper: borderClassNames,
          }}
          endContent={
            column.options?.currency && (
              <span className="mr-1.5">
                {intlStore.formatCurrency(0, column.options?.currency?.toString()).replace(/[\d\s,.-]/g, "")}
              </span>
            )
          }
          id={id ?? inputId}
          label={resolvedLabel ?? t(inputId)}
          value={formStringToNumber(value)}
          onValueChange={(n) => onChange(n === undefined ? undefined : String(n))}
        />
      );

    case CustomColumnType.plain:
      return (
        <XInput
          classNames={{
            inputWrapper: borderClassNames,
          }}
          id={inputId}
          label={resolvedLabel ?? t(inputId)}
          value={value}
          onValueChange={onChange}
        />
      );

    case CustomColumnType.date: {
      let parsedValue = null;
      if (value) {
        try {
          const normalizedValue = value.endsWith("Z") ? value.slice(0, -1) : value;
          parsedValue = parseDateTime(normalizedValue);
        } catch {
          parsedValue = undefined;
        }
      }

      return (
        <XIsoDatePicker
          showMonthAndYearPickers
          classNames={{
            inputWrapper: borderClassNames,
          }}
          granularity="day"
          id={inputId}
          label={resolvedLabel ?? t(inputId)}
          value={parsedValue}
          onChange={(dateValue) => {
            if (!dateValue) {
              onChange(undefined);
              return;
            }
            const dateStr = dateValue.toString();
            const isoDatetime =
              "hour" in dateValue || "minute" in dateValue || "second" in dateValue ? dateStr : `${dateStr}T00:00:00`;
            const normalized = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(isoDatetime)
              ? `${isoDatetime}Z`
              : isoDatetime;
            onChange(normalized);
          }}
        />
      );
    }

    case CustomColumnType.dateTime: {
      let parsedValue = null;
      if (value) {
        try {
          const normalizedValue = value.endsWith("Z") ? value.slice(0, -1) : value;
          parsedValue = parseDateTime(normalizedValue);
        } catch {
          parsedValue = undefined;
        }
      }

      return (
        <XIsoDatePicker
          showMonthAndYearPickers
          classNames={{
            inputWrapper: borderClassNames,
          }}
          granularity="minute"
          id={inputId}
          label={resolvedLabel ?? t(inputId)}
          value={parsedValue}
          onChange={(dateValue) => {
            if (!dateValue) {
              onChange(undefined);
              return;
            }
            const isoDatetime = dateValue.toString();
            const normalized = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(isoDatetime)
              ? `${isoDatetime}Z`
              : isoDatetime;
            onChange(normalized);
          }}
        />
      );
    }

    case CustomColumnType.email:
      return (
        <XInputChips
          allowMultiple={column.options?.allowMultiple}
          chipColor={column.options?.color}
          classNames={{
            inputWrapper: borderClassNames,
          }}
          id={inputId}
          label={resolvedLabel ?? t(inputId)}
          schema={z.email()}
          value={value}
          onValueChange={onChange}
        />
      );

    case CustomColumnType.phone:
      return (
        <XInputChips
          allowMultiple={column.options?.allowMultiple}
          chipColor={column.options?.color}
          classNames={{
            inputWrapper: borderClassNames,
          }}
          id={inputId}
          label={resolvedLabel ?? t(inputId)}
          schema={z.e164()}
          value={value}
          onValueChange={onChange}
        />
      );
  }
}
