import { describe, expect, it } from "vitest";

import { isResizeDoubleTap, resizeKeyboardStep, roundResizeSize } from "../resize-interaction";

describe("resize interaction", () => {
  it("recognizes only a timely, positive second touch tap as reset", () => {
    expect(isResizeDoubleTap(undefined, 1000)).toBe(false);
    expect(isResizeDoubleTap(1000, 1400)).toBe(true);
    expect(isResizeDoubleTap(1000, 1401)).toBe(false);
    expect(isResizeDoubleTap(1000, 1000)).toBe(false);
    expect(isResizeDoubleTap(1000, 999)).toBe(false);
  });

  it("shares the keyboard steps and size rounding for columns and panels", () => {
    expect(resizeKeyboardStep(false)).toBe(10);
    expect(resizeKeyboardStep(true)).toBe(30);
    expect(roundResizeSize(123.4567)).toBe(123.46);
  });
});
