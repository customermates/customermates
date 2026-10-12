"use client";

import type { EmbeddedRecordsStore } from "./embedded-records.store";

import { useState } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { Columns3, RotateCcw } from "lucide-react";

import { ColumnVisibilityList } from "@/components/data-view/header/column-visibility-list";
import { PopoverSection } from "@/components/data-view/header/popover-section";
import { useColumnLabel } from "@/components/data-view/use-column-label";
import { ResponsiveOverlay } from "@/components/modal";
import { AppModalActionRail } from "@/components/modal/app-modal-action";
import {
  fieldActionButtonClass,
  fieldActionIconClass,
  iconButtonClass,
  iconButtonIconClass,
} from "@/components/ui/icon-button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { runUserAction } from "@/core/errors/report-application-error";
import { cn } from "@/core/utils/cn";

export const RecordEmbeddedColumns = observer(function RecordEmbeddedColumns({
  list,
  label,
}: {
  list: EmbeddedRecordsStore;
  label: string;
}) {
  const t = useTranslations();
  const columnLabel = useColumnLabel();
  const [open, setOpen] = useState(false);
  const name = t("RecordModel.sublistColumns", { list: label });
  const hidden = new Set(list.hiddenColumns);
  const items = list.orderedColumns
    .filter((column) => column.uid !== list.parentColumnId)
    .map((column) => ({
      uid: column.uid,
      label: column.label || columnLabel(column.uid),
      isVisible: column.uid === list.primaryColumnId || !hidden.has(column.uid),
      isPinned: column.uid === list.primaryColumnId,
    }));
  const choose = (order: string[], visible: Set<string>) =>
    runUserAction(() => list.setColumnChoice(order.filter((uid) => uid !== list.primaryColumnId && visible.has(uid))));
  const shown = () => new Set(items.filter((item) => item.isVisible).map((item) => item.uid));
  const order = items.map((item) => item.uid);

  return (
    <Tooltip>
      <ResponsiveOverlay
        align="end"
        headerAction={
          list.columnChoice ? (
            <AppModalActionRail
              actions={[
                {
                  id: "reset-sublist-columns",
                  icon: RotateCcw,
                  label: t("RecordModel.resetSublistColumns"),
                  onClick: () => runUserAction(() => list.setColumnChoice(null)),
                },
              ]}
            />
          ) : undefined
        }
        open={open}
        popoverClassName="w-72"
        title={name}
        trigger={
          <TooltipTrigger asChild>
            <button
              aria-label={name}
              className={cn(iconButtonClass, fieldActionButtonClass)}
              data-sublist-columns=""
              type="button"
            >
              <Columns3 aria-hidden className={cn(iconButtonIconClass, fieldActionIconClass)} />
            </button>
          </TooltipTrigger>
        }
        onOpenChange={setOpen}
      >
        <PopoverSection label={t("RecordModel.sublistColumnsSection")}>
          <ColumnVisibilityList
            idPrefix={`sublist-${list.presentation.typeId}`}
            items={items}
            onReorder={(next) => choose(next, shown())}
            onToggle={(uid, visible) => {
              const next = shown();
              if (visible) next.add(uid);
              else next.delete(uid);
              choose(order, next);
            }}
          />
        </PopoverSection>
      </ResponsiveOverlay>

      <TooltipContent>{name}</TooltipContent>
    </Tooltip>
  );
});
