"use client";

import type { RecordType } from "@/features/records/record-model.schema";
import type { TypeModalStore } from "./type-modal";

import { observer } from "mobx-react-lite";
import {
  Activity,
  Archive,
  ArchiveRestore,
  Calculator,
  LayoutList,
  Link2,
  List,
  MoreHorizontal,
  Plus,
  TextCursorInput,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { FormActions } from "@/components/card/form-actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type ConfigureAddKind = "list" | "field" | "calculation" | "relationship" | "activity";

type Props = {
  canManage: boolean;
  disabled: boolean;
  general: TypeModalStore;
  generalFormId: string;
  selected?: RecordType;
  onAdd: (kind: ConfigureAddKind) => void;
  onSharedDefaults: () => void;
  onArchive: () => void;
};

export const ConfigureTopBarActions = observer(function ConfigureTopBarActions({
  canManage,
  disabled,
  general,
  generalFormId,
  selected,
  onAdd,
  onSharedDefaults,
  onArchive,
}: Props) {
  const t = useTranslations();
  if (!canManage) return null;
  if (selected && general.original?.id === selected.id && general.hasUnsavedChanges) {
    return (
      <FormActions
        formId={generalFormId}
        primaryButtonLabel={general.previewReady && !general.isLoading ? "RecordModel.apply" : "Common.actions.save"}
        store={general}
        variant="topbar"
      />
    );
  }
  return (
    <div className="flex shrink-0 items-center gap-1">
      {selected && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button aria-label={t("RecordModel.listActions")} disabled={disabled} size="icon-sm" variant="secondary">
              <MoreHorizontal aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onSharedDefaults}>
              <LayoutList aria-hidden="true" />

              {t("RecordModel.sharedDefaults")}
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            <DropdownMenuItem onSelect={onArchive}>
              {selected.archived ? <ArchiveRestore aria-hidden="true" /> : <Archive aria-hidden="true" />}

              {selected.archived ? t("RecordModel.unarchiveList") : t("RecordModel.archiveList")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label={t("Common.actions.add")}
            className="max-sm:size-8 max-sm:p-0 max-sm:has-[>svg]:px-0"
            disabled={disabled}
            size="sm"
          >
            <Plus aria-hidden="true" className="size-4" />

            <span className="hidden sm:inline">{t("Common.actions.add")}</span>
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => onAdd("list")}>
            <List aria-hidden="true" />

            {t("RecordModel.addMenu.list")}
          </DropdownMenuItem>

          {selected && (
            <>
              <DropdownMenuSeparator />

              <DropdownMenuItem onSelect={() => onAdd("field")}>
                <TextCursorInput aria-hidden="true" />

                {t("RecordModel.addMenu.field")}
              </DropdownMenuItem>

              <DropdownMenuItem onSelect={() => onAdd("calculation")}>
                <Calculator aria-hidden="true" />

                {t("RecordModel.addMenu.calculation")}
              </DropdownMenuItem>

              <DropdownMenuItem onSelect={() => onAdd("relationship")}>
                <Link2 aria-hidden="true" />

                {t("RecordModel.addMenu.relationship")}
              </DropdownMenuItem>

              <DropdownMenuItem onSelect={() => onAdd("activity")}>
                <Activity aria-hidden="true" />

                {t("RecordModel.addMenu.activityConnection")}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
});
