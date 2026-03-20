"use client";

import type { SharedSelection } from "@heroui/system-rsc";

import { ViewColumnsIcon } from "@heroicons/react/24/outline";
import { Button } from "@heroui/button";
import { Popover, PopoverTrigger } from "@heroui/popover";
import { Select } from "@heroui/select";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { useState, useRef } from "react";
import { CustomColumnType } from "@/generated/prisma";

import { XIcon } from "../../x-icon";
import { XSelectItem } from "../../x-inputs/x-select-item";
import { XTooltip } from "../../x-tooltip";
import { XBadge } from "../../x-badge";
import { XPopoverContent } from "../../x-popover/x-popover-content";
import { useXDataView } from "../x-data-view-container";

export const XDataViewKanbanGroupButton = observer(() => {
  const store = useXDataView();
  const t = useTranslations("Common");
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  const singleSelectColumns = store.customColumns.filter((col) => col.type === CustomColumnType.singleSelect);

  if (singleSelectColumns.length === 0) return null;

  const selectedKeys = store.groupingColumnId ? new Set([store.groupingColumnId]) : new Set<string>();

  function handleSelectionChange(keys: SharedSelection) {
    if (keys === "all") return;

    const keyArray = keys instanceof Set ? Array.from(keys).map((k) => String(k)) : [];
    const key = keyArray.length > 0 ? keyArray[0] : undefined;
    store.setViewOptions({ groupingColumnId: key });
  }

  return (
    <Popover ref={popoverRef} isOpen={isOpen} placement="bottom-end" onOpenChange={setIsOpen}>
      <XTooltip content={t("ariaLabels.tooltipGroupBy")}>
        <div>
          <XBadge
            borderColor="content1"
            content={store.groupingColumnId ? 1 : undefined}
            isInvisible={store.groupingColumnId ? false : true}
          >
            <PopoverTrigger>
              <Button isIconOnly size="sm" variant="flat">
                <XIcon icon={ViewColumnsIcon} />
              </Button>
            </PopoverTrigger>
          </XBadge>
        </div>
      </XTooltip>

      <XPopoverContent isDraggable={false} isOpen={isOpen} popoverRef={popoverRef} onClose={() => setIsOpen(false)}>
        <Select
          isClearable
          className="min-w-48"
          items={singleSelectColumns.map((col) => ({ key: col.id, label: col.label }))}
          label={t("table.groupBy")}
          selectedKeys={selectedKeys}
          size="sm"
          variant="bordered"
          onSelectionChange={handleSelectionChange}
        >
          {(item) => XSelectItem({ key: item.key, children: item.label })}
        </Select>
      </XPopoverContent>
    </Popover>
  );
});
