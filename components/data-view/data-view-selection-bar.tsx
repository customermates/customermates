"use client";

import type { ReactNode } from "react";
import type { BaseDataViewStore, HasId } from "@/core/base/base-data-view.store";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";

export const DataViewSelectionBar = observer(function DataViewSelectionBar<E extends HasId>({
  store,
  busy,
  status,
  children,
  ...props
}: {
  store: BaseDataViewStore<E>;
  busy: boolean;
  status?: ReactNode;
  children: ReactNode;
} & Record<`data-${string}`, string>) {
  const t = useTranslations();
  if (!store.hasSelection || !store.supportsSelection) return null;
  return (
    <div
      {...props}
      className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-border bg-card px-4 py-2"
    >
      <span className="whitespace-nowrap text-sm font-medium">
        {t("MassActions.selectedCount", { count: store.selectedCount })}
      </span>

      {store.selectedOffViewCount > 0 && (
        <span className="whitespace-nowrap text-xs text-muted-foreground">
          {t("MassActions.offView", { count: store.selectedOffViewCount })}
        </span>
      )}

      {status}

      <div className="grow" />

      {children}

      <Button
        aria-label={t("Common.actions.clear")}
        disabled={busy}
        size="icon-sm"
        type="button"
        variant="secondary"
        onClick={store.clearSelection}
      >
        <X className="size-4" />
      </Button>
    </div>
  );
});
