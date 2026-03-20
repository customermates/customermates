import type { BaseDataViewStore } from "@/core/base/base-data-view.store";
import type { HasId } from "@/core/base/base-data-view.store";

import { useCallback, useRef, useEffect, useState } from "react";
import { runInAction } from "mobx";

type UseTableResizeArgs<Entity extends HasId> = {
  store: BaseDataViewStore<Entity>;
  tableRef: React.RefObject<HTMLElement>;
};

export function useTableResize<Entity extends HasId = HasId>({ store, tableRef }: UseTableResizeArgs<Entity>) {
  const resizingColumnRef = useRef<string | null>(null);
  const resizeStartXRef = useRef(0);
  const resizeStartWidthRef = useRef(0);
  const currentResizeWidthRef = useRef<Record<string, number>>({});
  const [currentResizeWidth, setCurrentResizeWidth] = useState<number | null>(null);
  const [resizingColumn, setResizingColumn] = useState<string | null>(null);

  const getEffectiveColumnWidth = useCallback(
    (columnUid: string) => {
      if (resizingColumn === columnUid && currentResizeWidth !== null) return currentResizeWidth;

      return store.columnWidths[columnUid];
    },
    [store, resizingColumn, currentResizeWidth],
  );

  const handleResizeStart = useCallback(
    (e: React.MouseEvent, columnUid: string) => {
      e.preventDefault();
      e.stopPropagation();

      const columnElement = e.currentTarget.closest("[data-column-uid]") as HTMLElement;

      if (columnElement) {
        const storedWidth = store.columnWidths[columnUid];
        const computedWidth = columnElement.offsetWidth;
        const currentWidth = storedWidth || computedWidth;

        resizingColumnRef.current = columnUid;
        resizeStartXRef.current = e.clientX;
        resizeStartWidthRef.current = currentWidth;
        currentResizeWidthRef.current[columnUid] = currentWidth;
        setResizingColumn(columnUid);
        setCurrentResizeWidth(currentWidth);
      }
    },
    [store],
  );

  const handleResizeMove = useCallback(
    (e: MouseEvent) => {
      const currentResizingColumn = resizingColumnRef.current;

      if (currentResizingColumn && tableRef.current) {
        const deltaX = e.clientX - resizeStartXRef.current;
        const newWidth = Math.max(80, resizeStartWidthRef.current + deltaX);

        currentResizeWidthRef.current[currentResizingColumn] = newWidth;

        const cells = tableRef.current.querySelectorAll(`[data-column-uid="${currentResizingColumn}"]`);

        cells.forEach((cell) => {
          if (cell instanceof HTMLElement) {
            cell.style.width = `${newWidth}px`;
            cell.style.minWidth = `${newWidth}px`;
            cell.style.maxWidth = `${newWidth}px`;
          }
        });
      }
    },
    [store, tableRef],
  );

  const handleResizeEnd = useCallback(() => {
    const currentResizingColumn = resizingColumnRef.current;

    if (currentResizingColumn) {
      const finalWidth = currentResizeWidthRef.current[currentResizingColumn];

      if (finalWidth) {
        runInAction(() => {
          store.setViewOptions({ columnWidth: { uid: currentResizingColumn, width: finalWidth } });
        });
      }
    }

    resizingColumnRef.current = null;
    resizeStartXRef.current = 0;
    resizeStartWidthRef.current = 0;
    currentResizeWidthRef.current = {};
    setCurrentResizeWidth(null);
    setResizingColumn(null);
  }, [store]);

  useEffect(() => {
    function handleMouseMove(e: MouseEvent) {
      return handleResizeMove(e);
    }

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleResizeEnd);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleResizeEnd);
    };
  }, [handleResizeMove, handleResizeEnd]);

  return {
    resizingColumn,
    handleResizeStart,
    getEffectiveColumnWidth,
  };
}
