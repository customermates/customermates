"use client";

import type { RecordRow } from "@/features/records/record-presentation";
import type { LucideIcon } from "lucide-react";
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
import { recordTitle } from "@/components/records/record-title";
import { runUserAction } from "@/core/errors/report-application-error";
import { Button } from "@/components/ui/button";
import { useDataViewItemLayout } from "@/components/data-view/data-view-item-layout";
import { cn } from "@/core/utils/cn";

const actionClass =
  "inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-[color,background-color] hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring/70 disabled:pointer-events-none disabled:opacity-50 data-[state=open]:bg-accent [&_svg]:size-4";

export function recordRowName(store: RecordsStore, record: RecordRow, t: ReturnType<typeof useTranslations>) {
  const title = record.fields.find((field) => field.fieldId === store.type?.primaryFieldId)?.result;
  return recordTitle(title, store.type?.label, t);
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
  const openedDetails = useRef(false);
  const layout = useDataViewItemLayout();
  const moreLabel = t("RecordModel.moreActions", { name });
  return (
    <div className="flex items-center justify-end" data-record-row-actions="">
      <div
        aria-label={name}
        className={cn(
          "hidden items-center gap-1 rounded-md p-0.5 opacity-0 transition-opacity group-hover/card:bg-card group-hover/card:opacity-100 group-hover/row:bg-accent group-hover/row:opacity-100 group-data-[state=selected]/row:bg-selected focus-within:opacity-100 md:pointer-fine:flex",
          layout === "row" &&
            "md:pointer-fine:absolute md:pointer-fine:top-1/2 md:pointer-fine:right-2 md:pointer-fine:-translate-y-1/2",
        )}
        data-row-action-group=""
        role="group"
      >
        {contextAction && (
          <RowActionButton icon={contextAction.icon} label={contextAction.label} onClick={contextAction.onSelect} />
        )}

        {onOpen && (
          <RowActionButton
            icon={PanelLeftOpen}
            label={t("RecordModel.openDetails")}
            onClick={(trigger) => onOpen(trigger)}
          />
        )}

        {onDelete && (
          <RowActionButton
            icon={Trash2}
            label={deleteLabel ?? t("Common.actions.delete")}
            variant="destructiveOutline"
            onClick={() => runUserAction(onDelete)}
          />
        )}
      </div>

      <div className="opacity-0 transition-opacity group-hover/row:opacity-100 group-hover/card:opacity-100 focus-within:opacity-100 has-data-[state=open]:opacity-100 any-pointer-coarse:opacity-100 md:pointer-fine:hidden">
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
            {contextAction && (
              <DropdownMenuItem onSelect={contextAction.onSelect}>
                <contextAction.icon className="size-4" />

                {contextAction.label}
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
    </div>
  );
});

function RowActionButton({
  icon: Icon,
  label,
  variant = "secondary",
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  variant?: "secondary" | "destructiveOutline";
  onClick: (trigger: HTMLElement) => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-label={label}
          size="icon-xs"
          type="button"
          variant={variant}
          onClick={(event) => {
            event.stopPropagation();
            onClick(event.currentTarget);
          }}
        >
          <Icon aria-hidden />
        </Button>
      </TooltipTrigger>

      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
