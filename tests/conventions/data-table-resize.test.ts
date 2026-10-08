import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(`../../components/data-view/${path}`, import.meta.url), "utf8");
const dataTableSource = read("data-table.tsx");
const boardSource = read("data-kanban-view.tsx");
const handleSource = read("column-resize-handle.tsx");

describe("shared data-table resize contract", () => {
  it("starts custom pointer resizing from the rendered header width", () => {
    expect(dataTableSource).toContain('measure={(handle) => handle.closest("th")?.getBoundingClientRect().width}');
    expect(handleSource).toContain("setPointerCapture(event.pointerId)");
    expect(handleSource).toContain("onPointerCancel={cancel}");
    expect(dataTableSource).not.toContain("getResizeHandler()");
  });

  it("exposes a whole-header hover affordance and keyboard-operable handle", () => {
    expect(handleSource).toContain('data-slot="column-resize-handle"');
    expect(handleSource).toContain('data-slot="column-resize-indicator"');
    expect(handleSource).toContain("group-hover/resize-header:opacity-100");
    expect(dataTableSource).toContain('canResize && "group/resize-header"');
    expect(handleSource).toContain("w-0.5 rounded-full bg-foreground/45");
    expect(handleSource).toContain("group-focus-visible/resize-handle:bg-foreground/70");
    expect(handleSource).toContain("focus-visible:ring-foreground/50");
    expect(handleSource).toContain("any-pointer-coarse:w-6 any-pointer-coarse:opacity-100");
    expect(handleSource).not.toContain("resize-handle:bg-primary");
    expect(handleSource).not.toContain("ring-primary");
    expect(handleSource).toContain('aria-keyshortcuts="ArrowLeft ArrowRight Home End Enter Space"');
    expect(handleSource).toContain("event.detail === 0");
    expect(handleSource).toContain("keyboardColumnWidth(renderedWidth, event.key, event.shiftKey, bounds)");
    expect(dataTableSource).toContain("const canResize = header.column.getCanResize() && !isSelectionCol;");
  });

  it("applies the same draft width to header and body cells before persisting", () => {
    expect(dataTableSource.match(/fixedWidthStyle\(liveWidth\)/g)).toHaveLength(2);
    expect(handleSource).toContain("shouldCommitColumnResize(session)");
    expect(dataTableSource).toContain("withoutColumnWidth(store.columnWidths, columnId)");
    expect(handleSource).toContain('if (session.pointerType !== "touch" || session.hasMoved) return;');
  });

  it("resizes board lanes through the same handle and persists them with the view", () => {
    expect(boardSource).toContain("<ColumnResizeHandle");
    expect(boardSource).toContain("columnWidth: { uid: BOARD_LANE_WIDTH_KEY, width }");
    expect(boardSource).toContain("withoutColumnWidth(store.columnWidths, BOARD_LANE_WIDTH_KEY)");
  });
});
