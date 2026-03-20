import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";

import { useCallback } from "react";
import { PencilIcon, EnvelopeIcon, PhoneIcon } from "@heroicons/react/24/outline";
import { Button } from "@heroui/button";
import { observer } from "mobx-react-lite";
import { z } from "zod";
import { cn } from "@heroui/theme";

import { CustomColumnType } from "@/generated/prisma";

import { XFavicon } from "../../x-favicon";
import { XIcon } from "../../x-icon";
import { XInputNumber } from "../../x-inputs/x-input-number";

import { XInput } from "@/components/x-inputs/x-input";
import { XInputChips } from "@/components/x-inputs/x-input-chips";
import { XSelect } from "@/components/x-inputs/x-select";
import { XSelectItem } from "@/components/x-inputs/x-select-item";
import { XChip } from "@/components/x-chip/x-chip";
import { XIsoDatePicker } from "@/components/x-inputs/x-iso-date-picker";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useXForm } from "@/components/x-inputs/x-form";

type Props = {
  isEditing: boolean;
  column: CustomColumnDto;
  index: number;
};

export const XCustomFieldValueInput = observer(({ isEditing, column, index }: Props) => {
  const store = useXForm();
  const { intlStore, xCustomColumnModalStore } = useRootStore();

  const { type, label } = column;
  const id = `customFieldValues[${index}].value`;
  const value = store?.getValue(id) as string | undefined;

  const renderInput = useCallback(() => {
    const borderClassNames = isEditing ? "rounded-r-none" : undefined;

    switch (type) {
      case CustomColumnType.singleSelect:
        return (
          <XSelect
            isMultiline
            classNames={{
              trigger: borderClassNames,
            }}
            id={id}
            items={column.options?.options}
            label={label}
            renderValue={(items) =>
              items.map((item) => (
                <XChip key={item.key} color={item.data?.color}>
                  {item.data?.label}
                </XChip>
              ))
            }
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

      case CustomColumnType.link: {
        return (
          <XInputChips
            allowMultiple={column.options?.allowMultiple}
            chipColor={column.options?.color}
            classNames={{
              inputWrapper: borderClassNames,
            }}
            id={id}
            label={label}
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
          />
        );
      }

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
            id={id}
            label={label}
            value={value ? Number(value) : undefined}
            onValueChange={(value) => store?.onChange(id, String(value))}
          />
        );

      case CustomColumnType.plain:
        return (
          <XInput
            classNames={{
              inputWrapper: borderClassNames,
            }}
            id={id}
            label={label}
          />
        );

      case CustomColumnType.date:
        return (
          <XIsoDatePicker
            showMonthAndYearPickers
            classNames={{
              inputWrapper: borderClassNames,
            }}
            granularity="day"
            id={id}
            label={label}
          />
        );

      case CustomColumnType.dateTime:
        return (
          <XIsoDatePicker
            showMonthAndYearPickers
            classNames={{
              inputWrapper: borderClassNames,
            }}
            granularity="minute"
            id={id}
            label={label}
          />
        );

      case CustomColumnType.email: {
        return (
          <XInputChips
            allowMultiple={column.options?.allowMultiple}
            chipColor={column.options?.color}
            classNames={{
              inputWrapper: borderClassNames,
            }}
            id={id}
            label={label}
            schema={z.email()}
          />
        );
      }

      case CustomColumnType.phone: {
        return (
          <XInputChips
            allowMultiple={column.options?.allowMultiple}
            chipColor={column.options?.color}
            classNames={{
              inputWrapper: borderClassNames,
            }}
            id={id}
            label={label}
            schema={z.e164()}
          />
        );
      }
    }
  }, [store, type, value, isEditing, id, label, intlStore]);

  return (
    <div className={cn("grid", { "grid-cols-[1fr_3.5rem]": isEditing })}>
      {renderInput()}

      {isEditing && (
        <Button
          isIconOnly
          className="h-full w-full rounded-l-none"
          color="primary"
          variant="bordered"
          onPress={() => xCustomColumnModalStore.openWithColumn(column)}
        >
          <XIcon icon={PencilIcon} />
        </Button>
      )}
    </div>
  );
});
