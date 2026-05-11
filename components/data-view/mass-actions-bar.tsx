"use client";

import type { BaseDataViewStore, HasId } from "@/core/base/base-data-view.store";

import { TrashIcon, XIcon } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useState } from "react";
import { useTranslations } from "next-intl";

import { bulkDeleteEntitiesAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { useDeleteConfirmation } from "@/components/modal/hooks/use-delete-confirmation";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";

import { MassUpdatePopover } from "./mass-update-popover";

type Props<E extends HasId> = {
  store: BaseDataViewStore<E>;
};

export const MassActionsBar = observer(function MassActionsBar<E extends HasId>({ store }: Props<E>) {
  const t = useTranslations("");
  const { showDeleteConfirmation } = useDeleteConfirmation();
  const [isLoading, setIsLoading] = useState(false);

  const entityType = store.entityType;
  if (!store.hasSelection || !entityType) return null;

  async function handleDelete() {
    const ids = Array.from(store.selectedIds);
    if (ids.length === 0 || !entityType) return;

    setIsLoading(true);
    try {
      const res = await bulkDeleteEntitiesAction({ entityType, ids });
      if (res && !res.ok) {
        const announced = toastZodErrorTree(res.error);
        await store.refresh();
        throw new Error(announced ? "" : t("Common.notifications.unexpectedError"));
      }
      store.clearSelection();
      await store.refresh();
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-muted/40 border-b border-border">
      <span className="text-sm font-medium whitespace-nowrap">
        {t("MassActions.selectedCount", { count: store.selectedCount })}
      </span>

      <div className="grow" />

      <MassUpdatePopover store={store} />

      <Button
        className="h-8"
        disabled={isLoading}
        size="sm"
        type="button"
        variant="outline"
        onClick={() => showDeleteConfirmation(handleDelete)}
      >
        <TrashIcon className="size-4 text-destructive" />

        {t("MassActions.delete")}
      </Button>

      <Button
        aria-label={t("Common.actions.clear")}
        className="h-8"
        size="icon-sm"
        type="button"
        variant="outline"
        onClick={() => store.clearSelection()}
      >
        <XIcon className="size-4" />
      </Button>
    </div>
  );
});
