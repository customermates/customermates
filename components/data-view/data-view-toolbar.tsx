"use client";

import type { BaseDataViewStore, HasId } from "@/core/base/base-data-view.store";

import { ArrowDownToLine, ArrowUpFromLine, Plus } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { runUserAction } from "@/core/errors/report-application-error";

import { DataViewDisplayOptions } from "./header/display-options";
import { DataViewSearch } from "./header/search";
import { FilterPopover } from "./header/filter-popover";

type Props<E extends HasId> = {
  store: BaseDataViewStore<E>;
  onAdd?: () => void;
  onExport?: () => Promise<void> | void;
  onImport?: () => void;
  isSearchable?: boolean;
  searchPlaceholder?: string;
  showDisplayOptions?: boolean;
  anchorScope?: string;
  addLabel?: string;
};

export const DataViewToolbar = observer(function DataViewToolbar<E extends HasId>({
  store,
  onAdd,
  onExport,
  onImport,
  isSearchable = true,
  searchPlaceholder,
  showDisplayOptions = true,
  anchorScope,
  addLabel,
}: Props<E>) {
  const t = useTranslations();
  if (!store.isReady) return null;

  return (
    <div className="flex items-center gap-1">
      {isSearchable && (
        <div className="shrink-0">
          <DataViewSearch
            id={anchorScope ? `${anchorScope}-search` : undefined}
            placeholder={searchPlaceholder}
            store={store}
          />
        </div>
      )}

      <div className="flex items-center gap-1">
        <FilterPopover id={anchorScope ? `${anchorScope}-filter` : undefined} store={store} />

        {showDisplayOptions && (
          <DataViewDisplayOptions
            anchorScope={anchorScope}
            id={anchorScope ? `${anchorScope}-display-options` : undefined}
            store={store}
          />
        )}

        {(onExport || onImport) && store.canExport && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                aria-label={t("DataTransfer.menu")}
                className="h-8"
                data-transfer-menu=""
                id={anchorScope ? `${anchorScope}-transfer` : undefined}
                size="icon-sm"
                variant="secondary"
              >
                <ArrowDownToLine className="size-4" />
              </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end">
              {onExport && (
                <DropdownMenuItem onSelect={() => runUserAction(() => onExport())}>
                  <ArrowDownToLine className="size-4" />

                  {t("DataTransfer.export.action")}
                </DropdownMenuItem>
              )}

              {onImport && !store.isDisabled && (
                <DropdownMenuItem onSelect={() => onImport()}>
                  <ArrowUpFromLine className="size-4" />

                  {t("DataTransfer.import.action")}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {onAdd && !store.isDisabled && (
          <Button
            className="h-8"
            id={anchorScope ? `${anchorScope}-add` : undefined}
            size="sm"
            variant="default"
            onClick={onAdd}
          >
            <Plus className="size-3.5" />

            <span className="hidden sm:inline">{addLabel ?? t("Common.actions.add")}</span>
          </Button>
        )}
      </div>
    </div>
  );
});
