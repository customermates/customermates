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

  const offView = store.selectedOffViewCount;

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-4 py-2 bg-card border-b border-border">
      <span className="text-sm font-medium whitespace-nowrap">
        {t("MassActions.selectedCount", { count: store.selectedCount })}
      </span>

      {offView > 0 && (
        <span className="text-muted-foreground text-xs whitespace-nowrap">
          {t("MassActions.offView", { count: offView })}
        </span>
      )}

      {store.isSelectionScopeStale && (
        <>
          <span className="text-muted-foreground text-xs whitespace-nowrap">{t("MassActions.scopeStale")}</span>

          <Button
            className="h-7 px-2 text-xs"
            size="sm"
            type="button"
            variant="ghost"
            onClick={() => store.keepSelectionInView()}
          >
            {t("MassActions.keepInView")}
          </Button>
        </>
      )}

      <div className="grow" />

      {store.canUpdateSelection && <MassUpdatePopover store={store} />}

      {store.canDeleteSelection && (
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
      )}

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
