"use client";

import type { LucideIcon } from "lucide-react";
import type { RecordRow } from "@/features/records/record-presentation";
import type { RecordsStore } from "./records.store";

import { useRef } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { Ellipsis, PanelLeftOpen, Trash2 } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { runUserAction } from "@/core/errors/report-application-error";

const actionClass =
  "inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-[color,background-color] hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring/70 disabled:pointer-events-none disabled:opacity-50 data-[state=open]:bg-accent [&_svg]:size-4";

export function recordRowName(store: RecordsStore, record: RecordRow) {
  const title = record.fields.find((field) => field.fieldId === store.type?.primaryFieldId)?.result;
  return title?.state === "value" && title.value.kind === "text" ? title.value.value : (store.type?.label ?? "");
}

export type RecordRowAction = { icon: LucideIcon; label: string; onSelect: () => unknown };

export const RecordRowActions = observer(function RecordRowActions({
  name,
  action,
  onOpen,
  onDelete,
  deleteLabel,
}: {
  name: string;
  action?: RecordRowAction;
  onOpen?: (returnFocusTo: HTMLElement | null) => void;
  onDelete?: () => unknown;
  deleteLabel?: string;
}) {
  const t = useTranslations();
  const trigger = useRef<HTMLButtonElement>(null);
  const openedDetails = useRef(false);
  const moreLabel = t("RecordModel.moreActions", { name });
  return (
    <div
      className="flex items-center justify-end opacity-0 transition-opacity group-hover/row:opacity-100 group-hover/card:opacity-100 focus-within:opacity-100 has-data-[state=open]:opacity-100 any-pointer-coarse:opacity-100"
      data-record-row-actions=""
    >
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <button ref={trigger} aria-label={moreLabel} className={actionClass} type="button">
                <Ellipsis aria-hidden />
              </button>
            </DropdownMenuTrigger>
          </TooltipTrigger>

          <TooltipContent>{moreLabel}</TooltipContent>
        </Tooltip>

        <DropdownMenuContent
          align="end"
          onCloseAutoFocus={(event) => {
            if (!openedDetails.current) return;
            openedDetails.current = false;
            event.preventDefault();
          }}
        >
          {action && (
            <DropdownMenuItem onSelect={() => runUserAction(action.onSelect)}>
              <action.icon className="size-4" />

              {action.label}
            </DropdownMenuItem>
          )}

          {onOpen && (
            <DropdownMenuItem
              onSelect={() => {
                openedDetails.current = true;
                onOpen(trigger.current);
              }}
            >
              <PanelLeftOpen className="size-4" />

              {t("RecordModel.openDetails")}
            </DropdownMenuItem>
          )}

          {onDelete && (
            <DropdownMenuItem variant="destructive" onSelect={() => runUserAction(onDelete)}>
              <Trash2 className="size-4" />

              {deleteLabel ?? t("Common.actions.delete")}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
});
