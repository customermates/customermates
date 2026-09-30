"use client";

import type { Row } from "@tanstack/react-table";
import type { HasId } from "@/core/base/base-data-view.store";

import { flexRender } from "@tanstack/react-table";

import { cn } from "@/core/utils/cn";

type Props<E extends HasId> = {
  row: Row<E>;
  className?: string;
  primaryColumnId?: string;
};

export function DataCardBody<E extends HasId>({ row, className, primaryColumnId = "name" }: Props<E>) {
  const cells = row.getVisibleCells();
  const nameCell = cells.find((c) => c.column.id === primaryColumnId);
  const labelValueCells = cells.filter((c) => c.column.id !== primaryColumnId);

  return (
    <div className={cn("space-y-2", className)}>
      {nameCell && (
        <div className="text-sm font-medium [&_.truncate]:line-clamp-3 [&_.truncate]:whitespace-normal">
          {flexRender(nameCell.column.columnDef.cell, nameCell.getContext())}
        </div>
      )}

      {labelValueCells.map((cell) => {
        const headerDef = cell.column.columnDef.header;
        const label = typeof headerDef === "string" ? headerDef : cell.column.id;
        return (
          <div key={cell.id} className="flex items-center justify-between gap-3 text-sm">
            <span className="text-xs text-muted-foreground shrink-0">{label}</span>

            <span className="text-right truncate min-w-0">
              {flexRender(cell.column.columnDef.cell, cell.getContext())}
            </span>
          </div>
        );
      })}
    </div>
  );
}
