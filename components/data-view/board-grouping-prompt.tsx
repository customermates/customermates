"use client";

import type { BaseDataViewStore, HasId } from "@/core/base/base-data-view.store";

import { LayoutList } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { PageState } from "@/components/page-state/page-state";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRouter } from "@/i18n/navigation";

import { useGroupableFieldLabel } from "./use-groupable-field-label";

type Props<E extends HasId> = {
  store: BaseDataViewStore<E>;
};

export const BoardGroupingPrompt = observer(function BoardGroupingPrompt<E extends HasId>({ store }: Props<E>) {
  const t = useTranslations();
  const router = useRouter();
  const groupableLabel = useGroupableFieldLabel();
  const canCreateField = Boolean(store.schemaSettingsHref);

  function handleFieldChange(next: string) {
    const entry = store.groupableFields.find((field) => field.id === next);
    if (entry) store.setViewOptions({ grouping: entry.grouping });
  }

  function handleCreateField() {
    if (store.schemaSettingsHref) router.push(store.schemaSettingsHref);
  }

  return (
    <PageState
      action={
        <div className="flex flex-col items-center gap-3">
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

          {canCreateField && (
            <Button size="sm" onClick={handleCreateField}>
              {t("DataView.board.createField")}
            </Button>
          )}
        </div>
      }
      description={t("DataView.board.promptBody")}
      icon={LayoutList}
      state="empty"
      title={t("DataView.board.promptTitle")}
    />
  );
});
