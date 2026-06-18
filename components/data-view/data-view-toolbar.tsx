"use client";

import type { BaseDataViewStore, HasId } from "@/core/base/base-data-view.store";

import { Plus } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

import { DataViewDisplayOptions } from "./header/display-options";
import { DataViewSearch } from "./header/search";
import { FilterPopover } from "./header/filter-popover";

type Props<E extends HasId> = {
  store: BaseDataViewStore<E>;
  onAdd?: () => void;
  isSearchable?: boolean;
  searchPlaceholder?: string;
  showDisplayOptions?: boolean;
};

export const DataViewToolbar = observer(function DataViewToolbar<E extends HasId>({
  store,
  onAdd,
  isSearchable = true,
  searchPlaceholder,
  showDisplayOptions = true,
}: Props<E>) {
  const t = useTranslations();
  if (!store.isReady) return null;

  return (
    <div className="flex items-center gap-1">
      {isSearchable && (
        <div className="shrink-0">
          <DataViewSearch placeholder={searchPlaceholder} store={store} />
        </div>
      )}

      <div className="flex items-center gap-1">
        <FilterPopover store={store} />

        {showDisplayOptions && <DataViewDisplayOptions store={store} />}

        {onAdd && !store.isDisabled && (
          <Button className="h-8" size="sm" onClick={onAdd}>
            <Plus className="size-3.5" />

            <span className="hidden sm:inline">{t("Common.actions.add")}</span>
          </Button>
        )}
      </div>
    </div>
  );
});
