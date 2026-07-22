import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { calculateMenuPosition } from "../editor-positioning.utils";

const VIEWPORT = { innerWidth: 1000, innerHeight: 800 };

beforeAll(() => {
  (globalThis as unknown as { window: typeof VIEWPORT }).window = VIEWPORT;
});

afterAll(() => {
  delete (globalThis as unknown as { window?: unknown }).window;
});

describe("calculateMenuPosition", () => {
  it("places the menu above the cursor when there is room (cursorTop - menuHeight - gap)", () => {
    const pos = calculateMenuPosition({
      cursorTop: 400,
      cursorBottom: 420,
      cursorLeft: 100,
      menuWidth: 200,
      menuHeight: 40,
    });
    expect(pos).toEqual({ top: 400 - 40 - 10, left: 100 });
  });

  it("flips below the cursor (cursorBottom + gap) when there is no room above and more room below", () => {
    const pos = calculateMenuPosition({
      cursorTop: 20,
      cursorBottom: 40,
      cursorLeft: 100,
      menuWidth: 200,
      menuHeight: 40,
    });
    expect(pos.top).toBe(40 + 10);
  });

  it("clamps a tall flipped-below menu to the viewport bottom (viewportHeight - menuHeight - gap)", () => {
    const pos = calculateMenuPosition({
      cursorTop: 20,
      cursorBottom: 40,
      cursorLeft: 100,
      menuWidth: 200,
      menuHeight: 780,
    });
    expect(pos.top).toBe(800 - 780 - 10);
  });

  it("clamps to the viewport bottom when the cursor is below the fold (regression for off-screen cursor)", () => {
    const pos = calculateMenuPosition({
      cursorTop: 990,
      cursorBottom: 1010,
      cursorLeft: 100,
      menuWidth: 200,
      menuHeight: 300,
    });
    expect(pos.top).toBe(800 - 300 - 10);
    expect(pos.top + 300).toBeLessThanOrEqual(800);
  });

  it("clamps a menu taller than the viewport to the top gap", () => {
    const pos = calculateMenuPosition({
      cursorTop: 400,
      cursorBottom: 420,
      cursorLeft: 100,
      menuWidth: 200,
      menuHeight: 900,
    });
    expect(pos.top).toBe(10);
  });

  it("clamps horizontally when the menu would overflow the right edge", () => {
    const pos = calculateMenuPosition({
      cursorTop: 400,
      cursorBottom: 420,
      cursorLeft: 900,
      menuWidth: 200,
      menuHeight: 40,
    });
    expect(pos.left).toBe(1000 - 200 - 10);
  });

  it("centers on the selection midpoint when centered is set", () => {
    const pos = calculateMenuPosition({
      cursorTop: 400,
      cursorBottom: 420,
      cursorLeft: 400,
      cursorRight: 500,
      menuWidth: 200,
      menuHeight: 40,
      centered: true,
    });
    expect(pos.left).toBe((400 + 500) / 2 - 200 / 2);
  });
});
