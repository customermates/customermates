import { describe, expect, it, vi } from "vitest";

import { isWidgetOpeningClick, openWidgetEditor, WIDGET_CLICK_MOVEMENT_TOLERANCE } from "../widget-interaction";

const click = (overrides: Partial<Parameters<typeof isWidgetOpeningClick>[0]> = {}) =>
  isWidgetOpeningClick({
    startX: 100,
    startY: 100,
    endX: 100,
    endY: 100,
    startedOnInteractive: false,
    ...overrides,
  });

describe("isWidgetOpeningClick", () => {
  it("opens the widget for a plain click on the card", () => {
    expect(click()).toBe(true);
  });

  it("tolerates the small movement of a real click", () => {
    expect(click({ endX: 100 + WIDGET_CLICK_MOVEMENT_TOLERANCE - 1 })).toBe(true);
    expect(click({ endY: 100 - (WIDGET_CLICK_MOVEMENT_TOLERANCE - 1) })).toBe(true);
  });

  it("treats a drag as a drag rather than a click", () => {
    expect(click({ endX: 400 })).toBe(false);
    expect(click({ endY: 400 })).toBe(false);
    expect(click({ endX: 100 + WIDGET_CLICK_MOVEMENT_TOLERANCE })).toBe(false);
  });

  it("never opens the config modal from a click that began inside the widget's own content", () => {
    expect(click({ startedOnInteractive: true })).toBe(false);
  });

  it("keeps ignoring interactive content even when the pointer did not move at all", () => {
    expect(click({ startedOnInteractive: true, endX: 100, endY: 100 })).toBe(false);
  });
});

describe("openWidgetEditor", () => {
  it("resets the editor destination before loading the selected widget", async () => {
    const store = {
      loadById: vi.fn(),
      setExpandedFilterField: vi.fn(),
      setExpandedSection: vi.fn(),
    };

    await openWidgetEditor(store, "widget-1");

    expect(store.setExpandedSection).toHaveBeenCalledWith("config");
    expect(store.setExpandedFilterField).toHaveBeenCalledWith(undefined);
    expect(store.loadById).toHaveBeenCalledWith("widget-1");
  });
});
