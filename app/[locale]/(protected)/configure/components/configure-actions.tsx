"use client";

import type { ReactNode } from "react";
import type { RecordModel, RecordType } from "@/features/records/record-model.schema";
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
  Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { FormActions } from "@/components/card/form-actions";
import { runUserAction } from "@/core/errors/report-application-error";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { useDefinitionDeletion } from "./use-definition-deletion";

export type ConfigureAddKind = "list" | "field" | "calculation" | "relationship" | "activity";

type Props = {
  ai: ReactNode;
  canManage: boolean;
  disabled: boolean;
  general: TypeModalStore;
  generalFormId: string;
  selected?: RecordType;
  hasArchived: boolean;
  showArchived: boolean;
  onToggleArchived: () => void;
  onAdd: (kind: ConfigureAddKind) => void;
  onSharedDefaults: () => void;
  onArchive: () => void;
  model: RecordModel;
  onDeleted: () => Promise<void>;
};

export const ConfigureTopBarActions = observer(function ConfigureTopBarActions({
  ai,
  canManage,
  disabled,
  general,
  generalFormId,
  selected,
  hasArchived,
  showArchived,
  onToggleArchived,
  onAdd,
  onSharedDefaults,
  onArchive,
  model,
  onDeleted,
}: Props) {
  const t = useTranslations();
  const deletion = useDefinitionDeletion(onDeleted);
  if (!canManage) return <div className="flex shrink-0 items-center gap-1">{ai}</div>;
  if (selected && general.original?.id === selected.id && general.hasUnsavedChanges)
    return <FormActions formId={generalFormId} store={general} variant="topbar" />;

  return (
    <div className="flex shrink-0 items-center gap-1">
      {ai}

      {!selected && hasArchived && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button aria-label={t("RecordModel.listActions")} disabled={disabled} size="icon-sm" variant="secondary">
              <MoreHorizontal aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onToggleArchived}>
              <Archive aria-hidden="true" />

              {showArchived ? t("RecordModel.hideArchived") : t("RecordModel.showArchived")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

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

            {selected.archived && (
              <DropdownMenuItem
                disabled={deletion.isPreviewing}
                variant="destructive"
                onSelect={() => runUserAction(() => deletion.requestDeletion(model, { type: selected }))}
              >
                <Trash2 aria-hidden="true" />

                {t("RecordModel.permanentDeletion.deleteList")}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {selected ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button aria-label={t("Common.actions.add")} className="h-8" disabled={disabled} size="sm">
              <Plus aria-hidden="true" className="size-3.5" />

              <span className="hidden sm:inline">{t("Common.actions.add")}</span>
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => onAdd("list")}>
              <List aria-hidden="true" />

              {t("RecordModel.addMenu.list")}
            </DropdownMenuItem>

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
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <Button
          aria-label={t("Common.actions.add")}
          className="h-8"
          disabled={disabled}
          size="sm"
          onClick={() => onAdd("list")}
        >
          <Plus aria-hidden="true" className="size-3.5" />

          <span className="hidden sm:inline">{t("Common.actions.add")}</span>
        </Button>
      )}
    </div>
  );
});
