"use client";

import type { BaseDataViewStore, HasId } from "@/core/base/base-data-view.store";
import type { ColumnDef } from "@tanstack/react-table";
import type { ReactNode } from "react";

import { getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { Card, CardContent } from "@/components/ui/card";
import { useNavigateToHref } from "@/components/modal/hooks/use-entity-drawer-stack";
import { DataCardBody } from "./data-card-body";
import { cn } from "@/lib/utils";

import { isInteractiveClick } from "./is-interactive-click";

type Props<E extends HasId> = {
  store: BaseDataViewStore<E>;
  columns: ColumnDef<E>[];
  onCardClick?: (item: E) => void;
  cardHref?: (item: E) => string | undefined;
  renderCard?: (item: E) => ReactNode;
  className?: string;
};

export const DataCardView = observer(function DataCardView<E extends HasId>({
  store,
  columns,
  onCardClick,
  cardHref,
  renderCard,
  className,
}: Props<E>) {
  const navigateToHref = useNavigateToHref();
  const t = useTranslations("Common.table");
  const hidden = new Set(store.hiddenColumns);
  const visibleColumns = columns.filter((c) => !hidden.has((c as { id?: string }).id ?? ""));

  const table = useReactTable<E>({
    data: store.items,
    columns: visibleColumns,
    getRowId: (row) => row.id,
    getCoreRowModel: getCoreRowModel(),
  });

  if (store.items.length === 0)
    return <div className="py-12 text-center text-sm text-muted-foreground">{t("emptyContent")}</div>;

  return (
    <div className={cn("", className)} data-slot="card-grid">
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 p-4">
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
                  aria-label="Open"
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
                {renderCard ? renderCard(row.original) : <DataCardBody row={row} />}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
});
