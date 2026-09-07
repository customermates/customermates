"use client";

import type { BaseDataViewStore, HasId } from "@/core/base/base-data-view.store";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";

import { LayoutList } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { CustomColumnType } from "@/generated/prisma";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRootStore } from "@/core/stores/root-store.provider";

import { DataViewEmptyState } from "./data-view-empty-state";
import { useGroupableFieldLabel } from "./use-groupable-field-label";

type Props<E extends HasId> = {
  store: BaseDataViewStore<E>;
};

export const BoardGroupingPrompt = observer(function BoardGroupingPrompt<E extends HasId>({ store }: Props<E>) {
  const t = useTranslations();
  const { customColumnModalStore } = useRootStore();
  const groupableLabel = useGroupableFieldLabel();
  const entityType = store.entityType;
  const canCreateField = Boolean(entityType) && store.canManage;

  function handleFieldChange(next: string) {
    const entry = store.groupableFields.find((field) => field.id === next);
    if (entry) store.setViewOptions({ grouping: entry.grouping });
  }

  function handleCreateField() {
    if (!entityType) return;
    customColumnModalStore.openForCreate({
      type: CustomColumnType.singleSelect,
      entityType,
      onSaved: (column: CustomColumnDto) => store.setViewOptions({ grouping: { field: column.id } }),
    });
  }

  return (
    <DataViewEmptyState
      body={t("DataView.board.promptBody")}
      icon={LayoutList}
      primaryAction={
        canCreateField ? { label: t("DataView.board.createField"), onClick: handleCreateField } : undefined
      }
      title={t("DataView.board.promptTitle")}
    >
      {store.groupableFields.length > 0 && (
        <Select value={store.currentGroupableFieldId} onValueChange={handleFieldChange}>
          <SelectTrigger aria-label={t("DataView.board.chooseField")} className="w-64 max-w-full" size="sm">
            <SelectValue placeholder={t("DataView.board.chooseField")} />
          </SelectTrigger>

          <SelectContent>
            {store.groupableFields.map((field) => (
              <SelectItem key={field.id} value={field.id}>
                {groupableLabel(field)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </DataViewEmptyState>
  );
});
