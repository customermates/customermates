import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const dataTableSource = readFileSync(new URL("../../components/data-view/data-table.tsx", import.meta.url), "utf8");

describe("shared data-table resize contract", () => {
  it("starts custom pointer resizing from the rendered header width", () => {
    expect(dataTableSource).toContain("headerCell.getBoundingClientRect().width");
    expect(dataTableSource).toContain("setPointerCapture(event.pointerId)");
    expect(dataTableSource).toContain("onPointerCancel={cancelActiveResize}");
    expect(dataTableSource).not.toContain("getResizeHandler()");
  });

  it("exposes a whole-header hover affordance and keyboard-operable handle", () => {
    expect(dataTableSource).toContain('data-slot="column-resize-handle"');
    expect(dataTableSource).toContain('data-slot="column-resize-indicator"');
    expect(dataTableSource).toContain("group-hover/resize-header:opacity-100");
    expect(dataTableSource).toContain("w-0.5 rounded-full bg-foreground/45");
    expect(dataTableSource).toContain("group-focus-visible/resize-handle:bg-foreground/70");
    expect(dataTableSource).toContain("focus-visible:ring-foreground/50");
    expect(dataTableSource).toContain("any-pointer-coarse:w-6 any-pointer-coarse:opacity-100");
    expect(dataTableSource).not.toContain("resize-handle:bg-primary");
    expect(dataTableSource).not.toContain("ring-primary");
    expect(dataTableSource).toContain('aria-keyshortcuts="ArrowLeft ArrowRight Home Enter Space"');
    expect(dataTableSource).toContain("event.detail === 0");
    expect(dataTableSource).toContain("onResizeKeyDown(event, columnId)");
    expect(dataTableSource).toContain('const canResize = header.column.getCanResize() && !isSelectionCol;');
  });

  it("applies the same draft width to header and body cells before persisting", () => {
    expect(dataTableSource.match(/fixedWidthStyle\(liveWidth\)/g)).toHaveLength(2);
    expect(dataTableSource).toContain("shouldCommitColumnResize(session)");
    expect(dataTableSource).toContain("withoutColumnWidth(store.columnWidths, columnId)");
    expect(dataTableSource).toContain('if (session.pointerType !== "touch" || session.hasMoved) return;');
  });
});
