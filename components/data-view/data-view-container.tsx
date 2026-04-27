"use client";

import type { BaseDataViewStore, HasId } from "@/core/base/base-data-view.store";
import type { ColumnDef } from "@tanstack/react-table";
import type { ReactNode } from "react";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { useMemo } from "react";

import { ViewMode } from "@/core/base/base-query-builder";
import { cn } from "@/lib/utils";
import { useSetTopBarActions } from "@/app/components/topbar-actions-context";

import { DataCardView } from "./data-card-view";
import { DataKanbanView } from "./data-kanban-view";
import { DataTable } from "./data-table";
import { DataViewActiveFiltersBar } from "./header/active-filters-bar";
import { DataViewPagination } from "./header/pagination";
import { DataViewToolbar } from "./data-view-toolbar";
import { MassActionsBar } from "./mass-actions-bar";

type Props<E extends HasId> = {
  store: BaseDataViewStore<E>;
  columns: ColumnDef<E>[];
  title?: ReactNode;
  embedded?: boolean;
  onRowClick?: (item: E) => void;
  onAdd?: () => void;
  renderCard?: (item: E) => ReactNode;
  actions?: ReactNode;
  isSearchable?: boolean;
  searchPlaceholder?: string;
  className?: string;
};

export const DataViewContainer = observer(function DataViewContainer<E extends HasId>({
  store,
  columns,
  title,
  embedded,
  onRowClick,
  onAdd,
  renderCard,
  actions,
  isSearchable = true,
  searchPlaceholder,
  className,
}: Props<E>) {
  const t = useTranslations("Common.table.columns");
  const isEmbedded = embedded || Boolean(title);

  const resolvedColumns = useMemo<ColumnDef<E>[]>(() => {
    const byId = new Map(columns.map((c) => [c.id ?? "", c]));
    return store.orderedColumns
      .map((tc) => byId.get(tc.uid))
      .filter((c): c is ColumnDef<E> => c !== undefined)
      .map((c) => {
        const withHeader = c.header ? c : { ...c, header: t(c.id ?? "") };
        return c.id && store.sortableColumnIds.has(c.id)
          ? ({ ...withHeader, accessorKey: c.id } as ColumnDef<E>)
          : withHeader;
      });
  }, [columns, store.orderedColumns, store.sortableColumnIds, t]);

  const topBarNode = useMemo(
    () =>
      isEmbedded ? null : (
        <DataViewToolbar
          actions={actions}
          isSearchable={isSearchable}
          searchPlaceholder={searchPlaceholder}
          store={store}
          onAdd={onAdd}
        />
      ),
    [isEmbedded, actions, isSearchable, searchPlaceholder, store, onAdd],
  );

  useSetTopBarActions(topBarNode);

  if (!store.isReady) return null;

  const isTable = store.viewMode === ViewMode.table;
  const isKanban = store.viewMode === ViewMode.card && Boolean(store.groupingColumnId);

  const body = isTable ? (
    <DataTable columns={resolvedColumns} store={store} onRowClick={onRowClick} />
  ) : isKanban ? (
    <DataKanbanView columns={resolvedColumns} renderCard={renderCard} store={store} onCardClick={onRowClick} />
  ) : (
    <DataCardView columns={resolvedColumns} renderCard={renderCard} store={store} onCardClick={onRowClick} />
  );

  const toolbar = (
    <DataViewToolbar
      actions={actions}
      isSearchable={isSearchable}
      searchPlaceholder={searchPlaceholder}
      store={store}
      onAdd={onAdd}
    />
  );

  if (isEmbedded) {
    return (
      <div className={cn("flex flex-col gap-3", className)}>
        <div className="flex flex-col gap-2 xs:flex-row xs:items-center w-full">
          {title ? (
            <div className="flex items-baseline gap-2 grow min-w-0">
              <h2 className="text-[15px] font-semibold truncate">{title}</h2>

              {store.pagination?.total !== undefined && (
                <span className="text-xs text-muted-foreground tabular-nums">{store.pagination.total}</span>
              )}
            </div>
          ) : (
            <div className="grow" />
          )}

          {toolbar}
        </div>

        <MassActionsBar store={store} />

        <div className="rounded-xl bg-card overflow-hidden">
          <DataViewActiveFiltersBar store={store} />

          <div>{body}</div>

          <DataViewPagination store={store} />
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex h-[calc(100svh-4rem)] min-h-0 flex-col md:h-[calc(100svh-5rem)]", className)}>
      <MassActionsBar store={store} />

      <DataViewActiveFiltersBar store={store} />

      <div
        className="flex min-h-0 flex-1 flex-col overflow-hidden *:data-[slot=table-container]:h-full *:data-[slot=table-container]:overflow-auto *:data-[slot=kanban-root]:h-full *:data-[slot=kanban-root]:overflow-auto *:data-[slot=card-grid]:h-full *:data-[slot=card-grid]:overflow-y-auto"
        style={{ contain: "layout" }}
      >
        {body}
      </div>

      <DataViewPagination className="border-t border-border" store={store} />
    </div>
  );
});
