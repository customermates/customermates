"use client";

import type { ReactNode } from "react";
import type { BaseDataViewStore, HasId } from "@/core/base/base-data-view.store";

import { observer } from "mobx-react-lite";

import { DataViewActiveFiltersBar } from "./header/active-filters-bar";
import { DataViewPagination } from "./header/pagination";
import { MassActionsBar } from "./mass-actions-bar";

type Props<E extends HasId> = {
  children: ReactNode;
  showPagination: boolean;
  store: BaseDataViewStore<E>;
};

export const DataViewLayout = observer(function DataViewLayout<E extends HasId>({
  children,
  showPagination,
  store,
}: Props<E>) {
  return (
    <div className="flex h-[calc(100svh-4rem)] min-h-0 flex-col md:h-[calc(100svh-5rem)]">
      <MassActionsBar store={store} />

      <DataViewActiveFiltersBar store={store} />

      <div
        className="flex min-h-0 flex-1 flex-col overflow-hidden *:data-[slot=table-container]:h-full *:data-[slot=table-container]:overflow-auto *:data-[slot=kanban-root]:h-full *:data-[slot=kanban-root]:overflow-auto *:data-[slot=card-grid]:h-full *:data-[slot=card-grid]:overflow-y-auto"
        style={{ contain: "layout" }}
      >
        {children}
      </div>

      {showPagination && <DataViewPagination store={store} />}
    </div>
  );
});
