"use client";

import type { RecordRow } from "@/features/records/record-presentation";
import type { LucideIcon } from "lucide-react";
import type { RecordsStore } from "./records.store";

import { useRef } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { PanelLeftOpen, Trash2 } from "lucide-react";

import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { ItemActionsTrigger } from "@/components/ui/item-actions";
import { recordDisplayName } from "@/features/records/record-display-name";
import { runUserAction } from "@/core/errors/report-application-error";
import { useDataViewItemLayout } from "@/components/data-view/data-view-item-layout";
import { cn } from "@/core/utils/cn";

export function recordRowName(store: RecordsStore, record: RecordRow, t: ReturnType<typeof useTranslations>) {
  const title = record.fields.find((field) => field.fieldId === store.type?.primaryFieldId)?.result;
  return recordDisplayName(title, store.type?.label, t);
}

export const RecordRowActions = observer(function RecordRowActions({
  name,
  contextAction,
  onOpen,
  onDelete,
  deleteLabel,
}: {
  name: string;
  contextAction?: { label: string; icon: LucideIcon; onSelect: () => void };
  onOpen?: (returnFocusTo: HTMLElement | null) => void;
  onDelete?: () => unknown;
  deleteLabel?: string;
}) {
  const t = useTranslations();
  const trigger = useRef<HTMLButtonElement>(null);
  const pending = useRef<{ run: () => void; keepFocus: boolean } | null>(null);
  const afterClose = (run: () => void, keepFocus = false) => {
    pending.current = { run, keepFocus };
  };
  const layout = useDataViewItemLayout();
  return (
    <div
      className={cn(
        "flex items-center justify-end rounded-md",
        layout === "row" &&
          "absolute top-1/2 right-2 -translate-y-1/2 focus-within:bg-background group-hover/row:bg-background group-hover/row:bg-[image:linear-gradient(var(--accent),var(--accent))] group-data-[state=selected]/row:bg-background group-data-[state=selected]/row:bg-[image:linear-gradient(var(--selected),var(--selected))]",
        layout === "card" && "group-hover/card:bg-card",
      )}
      data-record-row-actions=""
    >
      <ItemActionsTrigger
        ref={trigger}
        label={t("RecordModel.moreActions", { name })}
        menu={
          <>
            {contextAction && (
              <DropdownMenuItem onSelect={() => afterClose(contextAction.onSelect)}>
                <contextAction.icon className="size-4" />

                {contextAction.label}
              </DropdownMenuItem>
            )}

            {onOpen && (
              <DropdownMenuItem onSelect={() => afterClose(() => onOpen(trigger.current), true)}>
                <PanelLeftOpen className="size-4" />

                {t("RecordModel.openDetails")}
              </DropdownMenuItem>
            )}

            {onDelete && (
              <DropdownMenuItem variant="destructive" onSelect={() => afterClose(() => runUserAction(onDelete))}>
                <Trash2 className="size-4" />

                {deleteLabel ?? t("Common.actions.delete")}
              </DropdownMenuItem>
            )}
          </>
        }
        onCloseAutoFocus={(event) => {
          const action = pending.current;
          if (!action) return;
          pending.current = null;
          if (action.keepFocus) event.preventDefault();
          action.run();
        }}
      />
    </div>
  );
});
