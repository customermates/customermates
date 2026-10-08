"use client";

import type { RecordRow } from "@/features/records/record-presentation";
import type { RecordsStore } from "./records.store";
import type { useRecordDeletion } from "./use-record-deletion";

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

export const RecordRowActions = observer(function RecordRowActions({
  store,
  record,
  deletion,
  onOpen,
}: {
  store: RecordsStore;
  record: RecordRow;
  deletion: ReturnType<typeof useRecordDeletion>;
  onOpen: (record: RecordRow, returnFocusTo: HTMLElement | null) => void;
}) {
  const t = useTranslations();
  const trigger = useRef<HTMLButtonElement>(null);
  const openedDetails = useRef(false);
  const name = recordRowName(store, record);
  const canDelete = store.presentation.permittedActions.includes("delete") && !record.protectedKind;
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
          <DropdownMenuItem
            onSelect={() => {
              openedDetails.current = true;
              onOpen(record, trigger.current);
            }}
          >
            <PanelLeftOpen className="size-4" />

            {t("RecordModel.openDetails")}
          </DropdownMenuItem>

          {canDelete && (
            <DropdownMenuItem
              variant="destructive"
              onSelect={() =>
                runUserAction(() => deletion.requestDeletion(record, store.presentation.model.revision, name))
              }
            >
              <Trash2 className="size-4" />

              {t("Common.actions.delete")}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
});
