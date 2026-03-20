"use client";

import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { CustomFieldValueDto } from "@/core/base/base-entity.schema";
import type { BaseDataViewStore, HasId } from "@/core/base/base-data-view.store";

import { useCallback, useState } from "react";
import { observer } from "mobx-react-lite";
import { ClipboardIcon, EnvelopeIcon, PhoneIcon } from "@heroicons/react/24/outline";
import { addToast } from "@heroui/toast";
import { useTranslations } from "next-intl";
import { Dropdown, DropdownMenu, DropdownTrigger } from "@heroui/dropdown";
import { CustomColumnType } from "@/generated/prisma";

import { XFavicon } from "../../x-favicon";
import { XClickableChip } from "../../x-chip/x-clickable-chip";
import { XDataViewCell } from "../x-data-view-cell";

import { XChip } from "@/components/x-chip/x-chip";
import { useRootStore } from "@/core/stores/root-store.provider";
import { XChipStack } from "@/components/x-chip/x-chip-stack";
import { XIcon } from "@/components/x-icon";
import { XDropdownItem } from "@/components/x-inputs/x-dropdown-item";
import { updateEntityCustomFieldValueAction } from "@/app/actions";

type Props<E extends HasId & { customFieldValues: CustomFieldValueDto[] }> = {
  column: CustomColumnDto;
  item: E;
  store: BaseDataViewStore<E>;
};

export const XCustomFieldValue = observer(
  <E extends HasId & { customFieldValues: CustomFieldValueDto[] }>({ column, item, store }: Props<E>) => {
    const t = useTranslations("");
    const { intlStore } = useRootStore();

    const [isDropdownOpen, setIsDropdownOpen] = useState(false);

    const field = item.customFieldValues.find((cfv) => cfv.columnId === column.id);
    const value = field?.value?.toString() ?? "";

    async function handleCopy(value: string) {
      try {
        await navigator.clipboard.writeText(value);
        addToast({
          description: t("Common.notifications.copiedToClipboard", { value }),
          color: "success",
          icon: <XIcon icon={ClipboardIcon} size="sm" />,
        });
      } catch {
        addToast({
          description: t("Common.notifications.copyFailed"),
          color: "danger",
        });
      }
    }

    async function handleSelectOption(optionValue: string) {
      const customFieldValues = [
        {
          columnId: column.id,
          value: optionValue,
        },
      ];

      try {
        const result = await updateEntityCustomFieldValueAction({
          entityType: column.entityType,
          entityId: item.id,
          customFieldValues,
        });
        if (result.ok) await store.upsertItem(result.data as unknown as E);
      } finally {
        setIsDropdownOpen(false);
      }
    }

    const renderValue = useCallback((): React.ReactElement => {
      switch (column.type) {
        case CustomColumnType.singleSelect: {
          const selectedOption = column.options.options.find((option) => option.value === field?.value);
          const options = column.options.options;

          if (!selectedOption) return <span />;

          return (
            <Dropdown isOpen={isDropdownOpen} onOpenChange={setIsDropdownOpen}>
              <DropdownTrigger>
                <XClickableChip color={selectedOption.color}>{selectedOption.label}</XClickableChip>
              </DropdownTrigger>

              <DropdownMenu
                className="max-h-60 overflow-y-auto"
                onAction={(key) => {
                  const option = options.find((opt) => opt.value === key);
                  if (option) void handleSelectOption(option.value);
                }}
              >
                {options.map((option) =>
                  XDropdownItem({
                    key: option.value,
                    children: <XChip color={option.color}>{option.label}</XChip>,
                  }),
                )}
              </DropdownMenu>
            </Dropdown>
          );
        }

        case CustomColumnType.link:
          return value ? (
            <XChipStack
              color={column.options?.color}
              items={value.split(",").map((it) => {
                const trimmedValue = it.trim();
                let displayLabel = trimmedValue;
                let startContent: React.ReactNode;

                try {
                  const url = new URL(trimmedValue);
                  if (url.protocol === "mailto:") {
                    displayLabel = url.pathname;
                    startContent = <XIcon className="p-0.5 rounded-lg overflow-hidden" icon={EnvelopeIcon} />;
                  } else if (url.protocol === "tel:") {
                    displayLabel = url.pathname;
                    startContent = <XIcon className="p-0.5 rounded-lg overflow-hidden" icon={PhoneIcon} />;
                  } else {
                    displayLabel = url.hostname;
                    startContent = <XFavicon className="p-0.5 rounded-lg overflow-hidden" value={trimmedValue} />;
                  }
                } catch {
                  startContent = <XFavicon className="p-0.5 rounded-lg overflow-hidden" value={trimmedValue} />;
                }

                return {
                  id: trimmedValue,
                  label: displayLabel,
                  startContent,
                };
              })}
              size="sm"
              variant="flat"
              onChipClick={(item) => {
                window.open(item.id, "_blank", "noreferrer");
              }}
            />
          ) : (
            <span />
          );

        case CustomColumnType.currency:
          return (
            <XDataViewCell>
              {intlStore.formatCurrency(isNaN(Number(value)) ? 0 : Number(value), column.options?.currency)}
            </XDataViewCell>
          );

        case CustomColumnType.date: {
          if (!value) return <span />;

          const parsedDate = new Date(value);

          if (isNaN(parsedDate.getTime())) return <span />;

          const displayFormat = column.options?.displayFormat ?? "descriptiveLong";
          const formatFn = intlStore.dateFormatMap[displayFormat];
          const formattedDate = formatFn(parsedDate);

          return <XDataViewCell>{formattedDate}</XDataViewCell>;
        }

        case CustomColumnType.dateTime: {
          if (!value) return <span />;

          const parsedDate = new Date(value);

          if (isNaN(parsedDate.getTime())) return <span />;

          const displayFormat = column.options?.displayFormat ?? "descriptiveLong";
          const formatFn = intlStore.dateTimeFormatMap[displayFormat];
          const formattedDateTime = formatFn(parsedDate);

          return <XDataViewCell>{formattedDateTime}</XDataViewCell>;
        }

        case CustomColumnType.plain:
          return <XDataViewCell>{value}</XDataViewCell>;

        case CustomColumnType.email:
        case CustomColumnType.phone:
          return value ? (
            <XChipStack
              color={column.options?.color}
              items={value.split(",").map((it) => ({
                id: it,
                label: it,
              }))}
              size="sm"
              variant="flat"
              onChipClick={(e) => void handleCopy(e.label)}
            />
          ) : (
            <span />
          );
      }
    }, [column, item, intlStore, value, isDropdownOpen, handleSelectOption]);

    return renderValue();
  },
);
