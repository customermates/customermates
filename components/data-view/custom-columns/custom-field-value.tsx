"use client";

import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { CustomFieldValueDto } from "@/core/base/base-entity.schema";
import type { BaseDataViewStore, HasId } from "@/core/base/base-data-view.store";

import { useCallback, useState } from "react";
import { observer } from "mobx-react-lite";
import { Mail, Phone } from "lucide-react";
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
import { TruncatedText } from "@/components/shared/truncated-text";
import { openableLinkTarget } from "@/core/validation/openable-link-target";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { Icon } from "@/components/shared/icon";
import { useCopyToClipboard } from "@/core/utils/use-copy-to-clipboard";
import { runUserAction } from "@/core/errors/report-application-error";

type Props<E extends HasId & { customFieldValues: CustomFieldValueDto[] }> = {
  column: CustomColumnDto;
  item: E;
  showOverflowTooltip?: boolean;
  store?: BaseDataViewStore<E>;
};

function CustomFieldTextValue({
  children,
  showOverflowTooltip,
  suppressHydrationWarning = false,
}: {
  children: string;
  showOverflowTooltip: boolean;
  suppressHydrationWarning?: boolean;
}) {
  return showOverflowTooltip ? (
    <TruncatedText className="w-full" suppressHydrationWarning={suppressHydrationWarning}>
      {children}
    </TruncatedText>
  ) : (
    <span className="block truncate" suppressHydrationWarning={suppressHydrationWarning}>
      {children}
    </span>
  );
}

export const CustomFieldValue = observer(
  <E extends HasId & { customFieldValues: CustomFieldValueDto[] }>({
    column,
    item,
    showOverflowTooltip = false,
    store,
  }: Props<E>) => {
    const copy = useCopyToClipboard();
    const intlStore = useHydratedIntlStore();

    const [isDropdownOpen, setIsDropdownOpen] = useState(false);

    const field = item.customFieldValues.find((cfv) => cfv.columnId === column.id);
    const value = field?.value?.toString() ?? "";

    async function handleSelectOption(optionValue: string) {
      if (!store) return;

      try {
        await store.updateCustomFieldValue(item.id, column.id, optionValue);
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
              <AppChip focusableTooltip size="sm" variant={selectedVariant}>
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
                  <button className="inline-flex max-w-full" type="button">
                    <ClickableChip variant={selectedVariant}>{selectedOption.label}</ClickableChip>
                  </button>
                </DropdownMenuTrigger>

                <DropdownMenuContent className="max-h-60 overflow-y-auto">
                  {options.map((option) => (
                    <DropdownMenuItem
                      key={option.value}
                      onSelect={() => runUserAction(() => handleSelectOption(option.value))}
                    >
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
                const target = openableLinkTarget(item.id);
                if (target) window.open(target, "_blank", "noreferrer");
              }}
            />
          ) : (
            <span />
          );

        case CustomColumnType.currency:
          return (
            <CustomFieldTextValue showOverflowTooltip={showOverflowTooltip}>
              {intlStore.formatCurrency(isNaN(Number(value)) ? 0 : Number(value), column.options?.currency)}
            </CustomFieldTextValue>
          );

        case CustomColumnType.date: {
          if (!value) return <span />;

          const parsedDate = new Date(value);

          if (isNaN(parsedDate.getTime())) return <span />;

          const displayFormat = column.options?.displayFormat ?? "descriptiveLong";
          const formatFn = intlStore.dateFormatMap[displayFormat];
          const formattedDate = formatFn(parsedDate);

          return (
            <CustomFieldTextValue suppressHydrationWarning showOverflowTooltip={showOverflowTooltip}>
              {formattedDate}
            </CustomFieldTextValue>
          );
        }

        case CustomColumnType.dateTime: {
          if (!value) return <span />;

          const parsedDate = new Date(value);

          if (isNaN(parsedDate.getTime())) return <span />;

          const displayFormat = column.options?.displayFormat ?? "descriptiveLong";
          const formatFn = intlStore.dateTimeFormatMap[displayFormat];
          const formattedDateTime = formatFn(parsedDate);

          return (
            <CustomFieldTextValue suppressHydrationWarning showOverflowTooltip={showOverflowTooltip}>
              {formattedDateTime}
            </CustomFieldTextValue>
          );
        }

        case CustomColumnType.dateRange: {
          if (!value) return <span />;

          const [startStr, endStr] = value.split(",").map((s) => s.trim());
          const start = startStr ? new Date(startStr) : undefined;
          const end = endStr ? new Date(endStr) : undefined;

          if (!start || !end || isNaN(start.getTime()) || isNaN(end.getTime())) return <span />;

          const displayFormat = column.options?.displayFormat ?? "descriptiveLong";
          const formatFn = intlStore.dateFormatMap[displayFormat];
          return (
            <CustomFieldTextValue suppressHydrationWarning showOverflowTooltip={showOverflowTooltip}>
              {`${formatFn(start)} – ${formatFn(end)}`}
            </CustomFieldTextValue>
          );
        }

        case CustomColumnType.dateTimeRange: {
          if (!value) return <span />;

          const [startStr, endStr] = value.split(",").map((s) => s.trim());
          const start = startStr ? new Date(startStr) : undefined;
          const end = endStr ? new Date(endStr) : undefined;

          if (!start || !end || isNaN(start.getTime()) || isNaN(end.getTime())) return <span />;

          const displayFormat = column.options?.displayFormat ?? "descriptiveLong";
          const formatFn = intlStore.dateTimeFormatMap[displayFormat];
          return (
            <CustomFieldTextValue suppressHydrationWarning showOverflowTooltip={showOverflowTooltip}>
              {`${formatFn(start)} – ${formatFn(end)}`}
            </CustomFieldTextValue>
          );
        }

        case CustomColumnType.plain:
          return <CustomFieldTextValue showOverflowTooltip={showOverflowTooltip}>{value}</CustomFieldTextValue>;

        case CustomColumnType.email:
        case CustomColumnType.phone:
          return value ? (
            <AppChipStack
              items={value.split(",").map((it) => ({
                id: it,
                label: it,
              }))}
              size="sm"
              onChipClick={(e) => runUserAction(() => copy(e.label))}
            />
          ) : (
            <span />
          );
      }
    }, [column, item, value, isDropdownOpen, handleSelectOption, copy, showOverflowTooltip]);

    return renderValue();
  },
);
