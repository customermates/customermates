import type { XTableColumn } from "@/core/base/base-data-view.store";

import { useCallback } from "react";
import { TableColumn } from "@heroui/table";

type UseRenderTableColumnArgs = {
  resizingColumn: string | null;
  handleResizeStart: (e: React.MouseEvent, columnUid: string) => void;
  getEffectiveColumnWidth: (columnUid: string) => number | undefined;
  translate: (key: string) => string;
};

export function useRenderTableColumn({
  resizingColumn,
  handleResizeStart,
  getEffectiveColumnWidth,
  translate,
}: UseRenderTableColumnArgs) {
  return useCallback(
    (column: XTableColumn) => {
      const isResizing = resizingColumn === column.uid;
      const label = column.label || translate(`table.columns.${column.uid}`);

      const columnWidth = getEffectiveColumnWidth(column.uid);
      const width = columnWidth ? `${columnWidth}px` : undefined;

      return (
        <TableColumn
          key={column.uid}
          allowsSorting={column.sortable && !isResizing}
          className={"relative text-subdued truncate"}
          data-column-uid={column.uid}
          style={{
            width,
            minWidth: width,
            maxWidth: width,
          }}
        >
          {label.toUpperCase()}

          <button
            className="absolute my-2 rounded-full right-3 top-0 bottom-0 w-1 cursor-col-resize border-none cursor-resize!
                       p-0 bg-content1-foreground opacity-0 transition-transform-opacity group-hover/th:opacity-100"
            type="button"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => {
              e.stopPropagation();
              handleResizeStart(e, column.uid);
            }}
            onMouseUp={(e) => e.stopPropagation()}
          />
        </TableColumn>
      );
    },
    [resizingColumn, handleResizeStart, getEffectiveColumnWidth, translate],
  );
}
