"use client";

import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { CustomFieldValueDto } from "@/core/base/base-entity.schema";
import type { BaseDataViewStore, HasId } from "@/core/base/base-data-view.store";

import { useCallback, useState } from "react";
import { observer } from "mobx-react-lite";
import { Mail, Phone } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { CustomColumnType } from "@/generated/prisma";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AppChip } from "@/components/chip/app-chip";
import { AppChipStack } from "@/components/chip/app-chip-stack";
import { ClickableChip } from "@/components/chip/clickable-chip";
import { Favicon } from "@/components/shared/favicon";
import { secureUrlSchema } from "@/core/validation/validation.utils";
import { useRootStore } from "@/core/stores/root-store.provider";
import { Icon } from "@/components/shared/icon";
import { copyToClipboard } from "@/lib/clipboard";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { updateEntityCustomFieldValueAction } from "@/app/actions";

type Props<E extends HasId & { customFieldValues: CustomFieldValueDto[] }> = {
  column: CustomColumnDto;
  item: E;
  store?: BaseDataViewStore<E>;
};

export const CustomFieldValue = observer(
  <E extends HasId & { customFieldValues: CustomFieldValueDto[] }>({ column, item, store }: Props<E>) => {
    const t = useTranslations("");
    const { intlStore } = useRootStore();

    const [isDropdownOpen, setIsDropdownOpen] = useState(false);

    const field = item.customFieldValues.find((cfv) => cfv.columnId === column.id);
    const value = field?.value?.toString() ?? "";

    async function handleCopy(value: string) {
      const ok = await copyToClipboard(value);
      if (ok) toast.success(t("Common.notifications.copiedToClipboard", { value }));
      else toast.error(t("Common.notifications.copyFailed"));
    }

    async function handleSelectOption(optionValue: string) {
      if (!store) return;

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
        else toastZodErrorTree(result.error);
      } finally {
        setIsDropdownOpen(false);
      }
    }

    const renderValue = useCallback((): React.ReactElement => {
      switch (column.type) {
        case CustomColumnType.singleSelect: {
          const selectedOption = column.options.options.find((option) => option.value === field?.value);

          if (!selectedOption) return <span />;

          const selectedVariant = selectedOption.color;

          if (!store) {
            return (
              <AppChip size="sm" variant={selectedVariant}>
                {selectedOption.label}
              </AppChip>
            );
          }

          const options = column.options.options;

          return (
            // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- stops clicks on the radix dropdown (trigger + portaled items) from bubbling to the parent card's navigation handler
            <span className="relative" onClick={(event) => event.stopPropagation()}>
              <DropdownMenu open={isDropdownOpen} onOpenChange={setIsDropdownOpen}>
                <DropdownMenuTrigger asChild>
                  <span>
                    <ClickableChip variant={selectedVariant}>{selectedOption.label}</ClickableChip>
                  </span>
                </DropdownMenuTrigger>

                <DropdownMenuContent className="max-h-60 overflow-y-auto">
                  {options.map((option) => (
                    <DropdownMenuItem key={option.value} onSelect={() => void handleSelectOption(option.value)}>
                      <AppChip variant={option.color}>{option.label}</AppChip>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </span>
          );
        }

        case CustomColumnType.link:
          return value ? (
            <AppChipStack
              items={value.split(",").map((it) => {
                const trimmedValue = it.trim();
                let displayLabel = trimmedValue;
                let startContent: React.ReactNode;

                try {
                  const url = new URL(trimmedValue);
                  if (url.protocol === "mailto:") {
                    displayLabel = url.pathname;
                    startContent = <Icon className="p-0.5 rounded-lg overflow-hidden" icon={Mail} />;
                  } else if (url.protocol === "tel:") {
                    displayLabel = url.pathname;
                    startContent = <Icon className="p-0.5 rounded-lg overflow-hidden" icon={Phone} />;
                  } else {
                    displayLabel = url.hostname;
                    startContent = <Favicon className="p-0.5 rounded-lg overflow-hidden" value={trimmedValue} />;
                  }
                } catch {
                  startContent = <Favicon className="p-0.5 rounded-lg overflow-hidden" value={trimmedValue} />;
                }

                return {
                  id: trimmedValue,
                  label: displayLabel,
                  startContent,
                };
              })}
              size="sm"
              onChipClick={(item) => {
                if (secureUrlSchema().safeParse(item.id).success) window.open(item.id, "_blank", "noreferrer");
              }}
            />
          ) : (
            <span />
          );

        case CustomColumnType.currency:
          return (
            <span className="block truncate">
              {intlStore.formatCurrency(isNaN(Number(value)) ? 0 : Number(value), column.options?.currency)}
            </span>
          );

        case CustomColumnType.date: {
          if (!value) return <span />;

          const parsedDate = new Date(value);

          if (isNaN(parsedDate.getTime())) return <span />;

          const displayFormat = column.options?.displayFormat ?? "descriptiveLong";
          const formatFn = intlStore.dateFormatMap[displayFormat];
          const formattedDate = formatFn(parsedDate);

          return <span className="block truncate">{formattedDate}</span>;
        }

        case CustomColumnType.dateTime: {
          if (!value) return <span />;

          const parsedDate = new Date(value);

          if (isNaN(parsedDate.getTime())) return <span />;

          const displayFormat = column.options?.displayFormat ?? "descriptiveLong";
          const formatFn = intlStore.dateTimeFormatMap[displayFormat];
          const formattedDateTime = formatFn(parsedDate);

          return <span className="block truncate">{formattedDateTime}</span>;
        }

        case CustomColumnType.dateRange: {
          if (!value) return <span />;

          const [startStr, endStr] = value.split(",").map((s) => s.trim());
          const start = startStr ? new Date(startStr) : undefined;
          const end = endStr ? new Date(endStr) : undefined;

          if (!start || !end || isNaN(start.getTime()) || isNaN(end.getTime())) return <span />;

          const displayFormat = column.options?.displayFormat ?? "descriptiveLong";
          const formatFn = intlStore.dateFormatMap[displayFormat];
          return <span className="block truncate">{`${formatFn(start)} – ${formatFn(end)}`}</span>;
        }

        case CustomColumnType.dateTimeRange: {
          if (!value) return <span />;

          const [startStr, endStr] = value.split(",").map((s) => s.trim());
          const start = startStr ? new Date(startStr) : undefined;
          const end = endStr ? new Date(endStr) : undefined;

          if (!start || !end || isNaN(start.getTime()) || isNaN(end.getTime())) return <span />;

          const displayFormat = column.options?.displayFormat ?? "descriptiveLong";
          const formatFn = intlStore.dateTimeFormatMap[displayFormat];
          return <span className="block truncate">{`${formatFn(start)} – ${formatFn(end)}`}</span>;
        }

        case CustomColumnType.plain:
          return <span className="block truncate">{value}</span>;

        case CustomColumnType.email:
        case CustomColumnType.phone:
          return value ? (
            <AppChipStack
              items={value.split(",").map((it) => ({
                id: it,
                label: it,
              }))}
              size="sm"
              onChipClick={(e) => void handleCopy(e.label)}
            />
          ) : (
            <span />
          );
      }
    }, [column, item, value, isDropdownOpen, handleSelectOption]);

    return renderValue();
  },
);
