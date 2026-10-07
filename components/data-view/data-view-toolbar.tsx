"use client";

import type { BaseDataViewStore, HasId } from "@/core/base/base-data-view.store";

import { ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import type { ReactNode } from "react";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { TopBarAddButton, TopBarMenuButton } from "@/components/shared/top-bar-action-buttons";
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
  actions?: ReactNode;
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
  actions,
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
          <TopBarMenuButton
            anchorId={anchorScope ? `${anchorScope}-transfer` : undefined}
            data-transfer-menu=""
            icon={ArrowDownToLine}
            label={t("DataTransfer.menu")}
          >
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
          </TopBarMenuButton>
        )}

        {actions}

        {onAdd && !store.isDisabled && (
          <TopBarAddButton
            anchorId={anchorScope ? `${anchorScope}-add` : undefined}
            label={addLabel ?? t("Common.actions.add")}
            onClick={onAdd}
          />
        )}
      </div>
    </div>
  );
});
