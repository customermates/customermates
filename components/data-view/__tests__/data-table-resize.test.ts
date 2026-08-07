import { describe, expect, it } from "vitest";

import {
  beginColumnResize,
  COLUMN_RESIZE_KEYBOARD_LARGE_STEP,
  COLUMN_RESIZE_KEYBOARD_STEP,
  columnResizeLabel,
  isTouchResetDoubleTap,
  keyboardColumnWidth,
  MIN_COLUMN_WIDTH,
  shouldCommitColumnResize,
  TOUCH_RESET_DOUBLE_TAP_MS,
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
    const session = start();

    expect(session.startWidth).toBe(237.5);
    expect(session.currentWidth).toBe(237.5);
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
    expect(keyboardColumnWidth(200, "ArrowLeft")).toBe(200 - COLUMN_RESIZE_KEYBOARD_STEP);
    expect(keyboardColumnWidth(200, "ArrowRight", true)).toBe(200 + COLUMN_RESIZE_KEYBOARD_LARGE_STEP);
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
    expect(isTouchResetDoubleTap(1000, 1000 + TOUCH_RESET_DOUBLE_TAP_MS)).toBe(true);
    expect(isTouchResetDoubleTap(1000, 1001 + TOUCH_RESET_DOUBLE_TAP_MS)).toBe(false);
    expect(isTouchResetDoubleTap(1000, 999)).toBe(false);
  });

  it("uses the visible or configured label instead of exposing custom-column IDs", () => {
    const customColumnId = "16000000-0000-4000-8000-000000000009";

    expect(columnResizeLabel(customColumnId, "Sales Pipeline")).toBe("Sales Pipeline");
    expect(columnResizeLabel(customColumnId, () => null, "Sales Pipeline")).toBe("Sales Pipeline");
    expect(columnResizeLabel("name", undefined)).toBe("name");
  });
});
