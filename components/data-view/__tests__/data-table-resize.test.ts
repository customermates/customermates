import { describe, expect, it } from "vitest";

import {
  beginColumnResize,
  columnResizeLabel,
  isTouchResetDoubleTap,
  keyboardColumnWidth,
  MIN_COLUMN_WIDTH,
  shouldCommitColumnResize,
  updateColumnResize,
  withoutColumnWidth,
} from "../data-table-resize";

function start(renderedWidth = 237.5) {
  return beginColumnResize({
    columnId: "name",
    pointerId: 1,
    pointerType: "mouse",
    clientX: 500,
    renderedWidth,
  });
}

describe("data-table column resizing", () => {
  it("uses the rendered column width instead of TanStack's unsized 150px default", () => {
    expect(start()).toMatchObject({ startWidth: 237.5, currentWidth: 237.5 });
  });

  it.each([1, 3, 5])("turns an initial %ipx pointer move into the same visible delta", (delta) => {
    const session = updateColumnResize(start(), 500 + delta);

    expect(session.currentWidth).toBe(237.5 + delta);
    expect(shouldCommitColumnResize(session)).toBe(true);
  });

  it("keeps zero-movement taps measurement-only", () => {
    const session = updateColumnResize(start(), 500);

    expect(session.currentWidth).toBe(session.startWidth);
    expect(shouldCommitColumnResize(session)).toBe(false);
  });

  it("does not commit a drag that returns to its starting coordinate", () => {
    const session = updateColumnResize(updateColumnResize(start(), 510), 500);

    expect(session.hasMoved).toBe(true);
    expect(shouldCommitColumnResize(session)).toBe(false);
  });

  it("starts subsequent and persisted-width drags from the newly rendered width", () => {
    const first = updateColumnResize(start(220), 512);
    const second = updateColumnResize(start(first.currentWidth), 496);

    expect(first.currentWidth).toBe(232);
    expect(second.startWidth).toBe(232);
    expect(second.currentWidth).toBe(228);
  });

  it("clamps only when the pointer crosses the 80px minimum", () => {
    expect(updateColumnResize(start(120), 461).currentWidth).toBe(81);
    expect(updateColumnResize(start(120), 460).currentWidth).toBe(MIN_COLUMN_WIDTH);
    expect(updateColumnResize(start(120), 430).currentWidth).toBe(MIN_COLUMN_WIDTH);
  });

  it("supports small and accelerated keyboard resizing plus the minimum shortcut", () => {
    expect(keyboardColumnWidth(200, "ArrowLeft")).toBe(190);
    expect(keyboardColumnWidth(200, "ArrowRight", true)).toBe(230);
    expect(keyboardColumnWidth(82, "ArrowLeft")).toBe(MIN_COLUMN_WIDTH);
    expect(keyboardColumnWidth(200, "Home")).toBe(MIN_COLUMN_WIDTH);
    expect(keyboardColumnWidth(200, "Enter")).toBeUndefined();
  });

  it("removes only the reset column's persisted width", () => {
    expect(withoutColumnWidth({ name: 240, email: 320 }, "name")).toEqual({
      email: 320,
    });
  });

  it("recognizes only a timely second touch tap as reset", () => {
    expect(isTouchResetDoubleTap(undefined, 1000)).toBe(false);
    expect(isTouchResetDoubleTap(1000, 1400)).toBe(true);
    expect(isTouchResetDoubleTap(1000, 1401)).toBe(false);
    expect(isTouchResetDoubleTap(1000, 999)).toBe(false);
  });

  it("uses the visible or configured label instead of exposing custom-column IDs", () => {
    const customColumnId = "16000000-0000-4000-8000-000000000009";

    expect(columnResizeLabel(customColumnId, "Sales Pipeline")).toBe("Sales Pipeline");
    expect(columnResizeLabel(customColumnId, () => null, "Sales Pipeline")).toBe("Sales Pipeline");
    expect(columnResizeLabel("name", undefined)).toBe("name");
  });
});
