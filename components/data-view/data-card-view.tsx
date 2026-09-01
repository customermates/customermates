"use client";

import type { BaseDataViewStore, HasId } from "@/core/base/base-data-view.store";
import type { ColumnDef } from "@tanstack/react-table";

import { getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { observer } from "mobx-react-lite";
import { visibleColumnDefs } from "./visible-column-defs";
import { useTranslations } from "next-intl";

import { Card, CardContent } from "@/components/ui/card";
import { useNavigateToHref } from "@/components/entity-detail/hooks/use-entity-drawer-stack";
import { DataCardBody } from "./data-card-body";
import { DATA_CARD_GRID_CLASS_NAME } from "./data-view-geometry";
import { cn } from "@/core/utils/cn";

import { isInteractiveClick } from "./is-interactive-click";

type Props<E extends HasId> = {
  store: BaseDataViewStore<E>;
  columns: ColumnDef<E>[];
  onCardClick?: (item: E) => void;
  cardHref?: (item: E) => string | undefined;
  className?: string;
};

export const DataCardView = observer(function DataCardView<E extends HasId>({
  store,
  columns,
  onCardClick,
  cardHref,
  className,
}: Props<E>) {
  const t = useTranslations();
  const navigateToHref = useNavigateToHref();
  const visibleColumns = visibleColumnDefs(columns, store.hiddenColumns);

  const table = useReactTable<E>({
    data: store.items,
    columns: visibleColumns,
    getRowId: (row) => row.id,
    getCoreRowModel: getCoreRowModel(),
  });

  if (store.items.length === 0) return null;

  return (
    <div className={cn("", className)} data-slot="card-grid">
      <div className={DATA_CARD_GRID_CLASS_NAME}>
        {table.getRowModel().rows.map((row) => {
          const href = cardHref?.(row.original);
          return (
            <Card
              key={row.id}
              className={cn("gap-3 py-4 relative", (onCardClick || href) && "interactive-surface")}
              onClick={(e) => {
                if (isInteractiveClick(e)) return;
                onCardClick?.(row.original);
              }}
            >
              {href && (
                <a
                  aria-label={t("Common.actions.open")}
                  className="absolute inset-0"
                  href={href}
                  tabIndex={-1}
                  onClick={(e) => {
                    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
                    e.preventDefault();
                    if (!onCardClick) navigateToHref(href);
                  }}
                />
              )}

              <CardContent className="px-4">
                <DataCardBody row={row} />
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
});
