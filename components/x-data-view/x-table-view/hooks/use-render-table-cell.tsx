import type { HasId } from "@/core/base/base-data-view.store";

import { useCallback } from "react";
import { TableCell } from "@heroui/table";

type UseRenderTableCellArgs<E extends HasId> = {
  getEffectiveColumnWidth: (columnUid: string) => number | undefined;
  renderCell: (item: E, columnKey: React.Key) => string | number | React.JSX.Element;
};

export function useRenderTableCell<E extends HasId>({
  getEffectiveColumnWidth,
  renderCell,
}: UseRenderTableCellArgs<E>) {
  return useCallback(
    (item: E, columnKey: React.Key) => {
      const columnWidth = getEffectiveColumnWidth(columnKey as string);
      const width = columnWidth ? `${columnWidth}px` : undefined;

      return (
        <TableCell
          data-column-uid={columnKey}
          style={{
            width,
            minWidth: width,
            maxWidth: width,
          }}
        >
          <div className="max-w-full overflow-hidden">{renderCell(item, columnKey)}</div>
        </TableCell>
      );
    },
    [renderCell, getEffectiveColumnWidth],
  );
}
