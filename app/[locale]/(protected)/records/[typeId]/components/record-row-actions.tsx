"use client";

import type { RecordRow } from "@/features/records/record-presentation";
import type { RecordsStore } from "./records.store";
import type { useRecordDeletion } from "./use-record-deletion";

import { observer } from "mobx-react-lite";
import { useLocale, useTranslations } from "next-intl";
import { Ellipsis, Link2, Maximize2, PanelLeftOpen, Trash2 } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { IntlLink } from "@/i18n/navigation";
import { cn } from "@/core/utils/cn";
import { runUserAction } from "@/core/errors/report-application-error";
import { useCopyToClipboard } from "@/core/utils/use-copy-to-clipboard";

const actionClass =
  "inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-[color,background-color] hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring/70 disabled:pointer-events-none disabled:opacity-50 data-[state=open]:bg-accent [&_svg]:size-4";

export function recordRowName(store: RecordsStore, record: RecordRow) {
  const title = record.fields.find((field) => field.fieldId === store.type?.primaryFieldId)?.result;
  return title?.state === "value" && title.value.kind === "text" ? title.value.value : (store.type?.label ?? "");
}

function RowAction({
  label,
  className,
  onClick,
  icon,
}: {
  label: string;
  className?: string;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button aria-label={label} className={cn(actionClass, className)} type="button" onClick={onClick}>
          {icon}
        </button>
      </TooltipTrigger>

      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
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
  onOpen: (record: RecordRow) => void;
}) {
  const t = useTranslations();
  const copy = useCopyToClipboard();
  const locale = useLocale();
  const name = recordRowName(store, record);
  const href = `/records/${record.ref.typeId}/${record.ref.recordId}`;
  const canDelete = store.presentation.permittedActions.includes("delete") && !record.protectedKind;
  return (
    <div
      className="flex items-center justify-end gap-0.5 opacity-0 transition-opacity group-hover/row:opacity-100 focus-within:opacity-100 has-data-[state=open]:opacity-100 any-pointer-coarse:opacity-100"
      data-record-row-actions=""
    >
      <RowAction
        icon={<PanelLeftOpen aria-hidden />}
        label={t("RecordModel.openRecordDetails", { name })}
        onClick={() => onOpen(record)}
      />

      {canDelete && (
        <RowAction
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          icon={<Trash2 aria-hidden />}
          label={t("RecordModel.deleteRecord", { name })}
          onClick={() => runUserAction(() => deletion.requestDeletion(record, store.presentation.model.revision, name))}
        />
      )}

      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <button aria-label={t("RecordModel.moreActions", { name })} className={actionClass} type="button">
                <Ellipsis aria-hidden />
              </button>
            </DropdownMenuTrigger>
          </TooltipTrigger>

          <TooltipContent>{t("RecordModel.moreActions", { name })}</TooltipContent>
        </Tooltip>

        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <IntlLink href={href}>
              <Maximize2 className="size-4" />

              {t("RecordModel.openPage")}
            </IntlLink>
          </DropdownMenuItem>

          <DropdownMenuItem
            onSelect={() => {
              runUserAction(() => copy(new URL(`/${locale}${href}`, window.location.origin).toString()));
            }}
          >
            <Link2 className="size-4" />

            {t("DataView.views.copyLink")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
});
