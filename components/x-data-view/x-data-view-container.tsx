"use client";

import type { ReactNode } from "react";
import type { HasId } from "@/core/base/base-data-view.store";
import type { BaseDataViewStore } from "@/core/base/base-data-view.store";

import { PlusIcon } from "@heroicons/react/24/outline";
import { Button } from "@heroui/button";
import { createContext, useContext } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { XDataViewFiltersBar } from "./x-header/x-data-view-filters-bar";
import { XTableView } from "./x-table-view/x-table-view";
import { XGridView } from "./x-card-view/x-grid-view";
import { XKanbanView } from "./x-card-view/x-kanban-view";
import { XDataViewFieldsSelect } from "./x-header/x-data-view-fields-select";
import { XDataViewFiltersButton } from "./x-header/x-data-view-filters-button";
import { XDataViewKanbanGroupButton } from "./x-header/x-data-view-kanban-group-button";
import { XDataViewPaginator } from "./x-data-view-paginator";
import { XDataViewSearch } from "./x-header/x-data-view-search";
import { XDataViewToggle } from "./x-header/x-data-view-toggle";
import { XDataViewSortButton } from "./x-header/x-data-view-sort-button";

import { XCard } from "@/components/x-card/x-card";
import { XCardHeader } from "@/components/x-card/x-card-header";
import { XIcon } from "@/components/x-icon";
import { XTooltip } from "@/components/x-tooltip";
import { ViewMode } from "@/core/base/base-query-builder";

export const XDataViewContext = createContext<BaseDataViewStore<HasId> | null>(null);

export function useXDataView<E extends HasId = HasId>(): BaseDataViewStore<E> {
  const context = useContext(XDataViewContext);
  if (!context) throw new Error("useXDataView must be used within XDataViewContainer");
  return context as unknown as BaseDataViewStore<E>;
}

type Props<E extends HasId> = {
  title: ReactNode;
  isSearchable?: boolean;
  searchTooltip?: string;
  store: BaseDataViewStore<E>;
  renderCell: (item: E, columnKey: React.Key) => string | number | JSX.Element;
  onAdd?: () => void;
  onRowAction?: (item: E) => void;
  actions?: ReactNode;
};

export const XDataViewContainer = observer(
  <E extends HasId>({
    title,
    isSearchable = true,
    searchTooltip,
    store,
    renderCell,
    onAdd,
    onRowAction,
    actions,
  }: Props<E>) => {
    const t = useTranslations("Common");

    if (!store.isReady) return null;

    const { canManage, isDisabled } = store;

    return (
      <XDataViewContext.Provider value={store as unknown as BaseDataViewStore<HasId>}>
        <XCard className="sticky left-0 overflow-visible">
          <XCardHeader className={store.viewMode === ViewMode.card ? "pb-6" : ""}>
            <div className="flex flex-col space-y-3 w-full">
              <div className="flex flex-col xs:flex-row xs:items-center gap-3 w-full">
                <h2 className="text-x-lg grow truncate mr-2">{title}</h2>

                <div className="flex gap-3 flex-wrap">
                  {store.filterableFields.length > 0 && (
                    <XTooltip content={t("ariaLabels.tooltipFilters")}>
                      <div>
                        <XDataViewFiltersButton />
                      </div>
                    </XTooltip>
                  )}

                  {isSearchable && (
                    <XTooltip content={searchTooltip ?? t("ariaLabels.tooltipSearch")}>
                      <div>
                        <XDataViewSearch />
                      </div>
                    </XTooltip>
                  )}

                  <XTooltip content={t("ariaLabels.tooltipFields")}>
                    <div>
                      <XDataViewFieldsSelect />
                    </div>
                  </XTooltip>

                  <XDataViewToggle />

                  {store.viewMode === ViewMode.card && (
                    <>
                      <XTooltip content={t("ariaLabels.tooltipSort")}>
                        <div>
                          <XDataViewSortButton />
                        </div>
                      </XTooltip>

                      <XDataViewKanbanGroupButton />
                    </>
                  )}

                  {onAdd && canManage && (
                    <XTooltip content={t("ariaLabels.tooltipAdd")}>
                      <Button
                        isIconOnly
                        color="primary"
                        isDisabled={isDisabled}
                        size="sm"
                        variant="flat"
                        onPress={onAdd}
                      >
                        <XIcon icon={PlusIcon} />
                      </Button>
                    </XTooltip>
                  )}
                </div>

                {actions && actions}
              </div>

              {store.filterableFields.length > 0 && <XDataViewFiltersBar />}
            </div>
          </XCardHeader>

          {store.viewMode === ViewMode.table && (
            <>
              <XTableView renderCell={renderCell} onRowAction={onRowAction} />

              <XDataViewPaginator />
            </>
          )}
        </XCard>

        {store.viewMode === ViewMode.card && (
          <>
            {store.groupingColumnId ? (
              <XKanbanView renderCell={renderCell} onCardAction={onRowAction} />
            ) : (
              <XGridView renderCell={renderCell} onCardAction={onRowAction} />
            )}

            <XDataViewPaginator />
          </>
        )}
      </XDataViewContext.Provider>
    );
  },
);
