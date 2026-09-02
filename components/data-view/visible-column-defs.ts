import type { ColumnDef } from "@tanstack/react-table";

export function visibleColumnDefs<E>(columns: ColumnDef<E>[], hiddenColumns: string[]): ColumnDef<E>[] {
  const hidden = new Set(hiddenColumns);

  return columns.filter((column) => !hidden.has((column as { id?: string }).id ?? ""));
}
