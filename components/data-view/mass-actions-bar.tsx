"use client";

import type { BaseDataViewStore, HasId } from "@/core/base/base-data-view.store";

import { TrashIcon, XIcon } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { useDeleteConfirmation } from "@/components/modal/hooks/use-delete-confirmation";

import { MassUpdatePopover } from "./mass-update-popover";

type Props<E extends HasId> = {
  store: BaseDataViewStore<E>;
};

export const MassActionsBar = observer(function MassActionsBar<E extends HasId>({ store }: Props<E>) {
  const t = useTranslations();
  const { showDeleteConfirmation } = useDeleteConfirmation();

  const entityType = store.entityType;
  if (!store.hasSelection || !entityType) return null;

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-card border-b border-border">
      <span className="text-sm font-medium whitespace-nowrap">
        {t("MassActions.selectedCount", { count: store.selectedCount })}
      </span>

      <div className="grow" />

      <MassUpdatePopover store={store} />

      <Button
        className="h-8"
        disabled={store.isBulkMutating}
        id="mass-delete"
        size="sm"
        type="button"
        variant="secondary"
        onClick={() => showDeleteConfirmation(() => store.bulkDelete())}
      >
        <TrashIcon className="size-4 text-destructive" />

        {t("MassActions.delete")}
      </Button>

      <Button
        aria-label={t("Common.actions.clear")}
        className="h-8"
        size="icon-sm"
        type="button"
        variant="secondary"
        onClick={() => store.clearSelection()}
      >
        <XIcon className="size-4" />
      </Button>
    </div>
  );
});
