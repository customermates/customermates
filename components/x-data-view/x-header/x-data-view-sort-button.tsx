"use client";

import { ArrowsUpDownIcon } from "@heroicons/react/24/outline";
import { Button } from "@heroui/button";
import { Popover, PopoverTrigger } from "@heroui/popover";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { useState, useRef } from "react";

import type { Prisma } from "@/generated/prisma";

import { XBadge } from "../../x-badge";
import { XIcon } from "../../x-icon";
import { XSelect } from "../../x-inputs/x-select";
import { XSelectItem } from "../../x-inputs/x-select-item";
import { XPopoverContent } from "../../x-popover/x-popover-content";
import { useXDataView } from "../x-data-view-container";

import { ViewMode } from "@/core/base/base-query-builder";

export const XDataViewSortButton = observer(() => {
  const store = useXDataView();
  const t = useTranslations("Common");
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  if (store.viewMode !== ViewMode.card) return null;

  const sortableColumns = store.columnsDefinition.filter((col) => col.sortable);

  if (sortableColumns.length === 0) return null;

  const currentField = store.sortDescriptor?.field;
  const currentDirection = store.sortDescriptor?.direction;

  const fieldOptions = sortableColumns.map((col) => ({
    key: col.uid,
    label: col.label || t(`table.columns.${col.uid}`),
  }));

  const directionOptions = [
    { key: "asc", label: t("sort.ascending") },
    { key: "desc", label: t("sort.descending") },
  ];

  function handleFieldChange(field: string | undefined) {
    if (!field) {
      store.setQueryOptions({ sortDescriptor: undefined });
      return;
    }

    store.setQueryOptions({
      sortDescriptor: {
        field,
        direction: currentDirection || ("asc" as Prisma.SortOrder),
      },
    });
  }

  function handleDirectionChange(direction: string | undefined) {
    if (!direction || !currentField) return;

    store.setQueryOptions({
      sortDescriptor: {
        field: currentField,
        direction: direction as Prisma.SortOrder,
      },
    });
  }

  const hasActiveSort = Boolean(currentField);

  return (
    <Popover ref={popoverRef} isOpen={isOpen} placement="bottom-end" onOpenChange={setIsOpen}>
      <XBadge borderColor="content1" content={hasActiveSort ? 1 : undefined} isInvisible={hasActiveSort ? false : true}>
        <PopoverTrigger>
          <Button isIconOnly size="sm" variant="flat">
            <XIcon icon={ArrowsUpDownIcon} />
          </Button>
        </PopoverTrigger>
      </XBadge>

      <XPopoverContent isDraggable={false} isOpen={isOpen} popoverRef={popoverRef} onClose={() => setIsOpen(false)}>
        <XSelect
          className="min-w-64"
          id="sortField"
          items={fieldOptions}
          label={t("sort.field")}
          size="sm"
          value={currentField}
          onSelectionChange={(keys) => {
            const key = new Set(keys).values().next().value as string | undefined;
            handleFieldChange(key);
          }}
        >
          {(item) => XSelectItem({ key: item.key, children: item.label })}
        </XSelect>

        {currentField && (
          <XSelect
            id="sortDirection"
            items={directionOptions}
            label={t("sort.direction")}
            size="sm"
            value={currentDirection || "asc"}
            onSelectionChange={(keys) => {
              const key = new Set(keys).values().next().value as string | undefined;
              handleDirectionChange(key);
            }}
          >
            {(item) => XSelectItem({ key: item.key, children: item.label })}
          </XSelect>
        )}
      </XPopoverContent>
    </Popover>
  );
});
