import { describe, expect, it } from "vitest";

import {
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  clampSidebarWidth,
  keyboardSidebarWidth,
  parseSidebarOpen,
  parseSidebarWidth,
  sidebarOpenCookie,
  sidebarWidthCookie,
} from "../sidebar-width";

describe("sidebar width", () => {
  it("clamps and rounds widths into the allowed range", () => {
    expect(clampSidebarWidth(100)).toBe(SIDEBAR_MIN_WIDTH);
    expect(clampSidebarWidth(900)).toBe(SIDEBAR_MAX_WIDTH);
    expect(clampSidebarWidth(300.4)).toBe(300);
  });

  it("restores a stored width and ignores anything unreadable", () => {
    expect(parseSidebarWidth("300")).toBe(300);
    expect(parseSidebarWidth("9000")).toBe(SIDEBAR_MAX_WIDTH);
    expect(parseSidebarWidth("12")).toBe(SIDEBAR_MIN_WIDTH);
    expect(parseSidebarWidth(undefined)).toBeUndefined();
    expect(parseSidebarWidth("")).toBeUndefined();
    expect(parseSidebarWidth("wide")).toBeUndefined();
    expect(parseSidebarWidth("Infinity")).toBeUndefined();
  });

  it("writes a clamped cookie and clears it on reset", () => {
    expect(sidebarWidthCookie(300)).toBe("sidebar_width=300; path=/; max-age=31536000");
    expect(sidebarWidthCookie(1000)).toContain(`sidebar_width=${SIDEBAR_MAX_WIDTH};`);
    expect(sidebarWidthCookie(null)).toBe("sidebar_width=; path=/; max-age=0");
  });

  it("steps with the arrow keys and jumps to the bounds with Home and End", () => {
    expect(keyboardSidebarWidth("ArrowRight", false, 256)).toBe(266);
    expect(keyboardSidebarWidth("ArrowLeft", true, 256)).toBe(226);
    expect(keyboardSidebarWidth("ArrowLeft", false, SIDEBAR_MIN_WIDTH)).toBe(SIDEBAR_MIN_WIDTH);
    expect(keyboardSidebarWidth("ArrowRight", true, SIDEBAR_MAX_WIDTH)).toBe(SIDEBAR_MAX_WIDTH);
    expect(keyboardSidebarWidth("Home", false, 300)).toBe(SIDEBAR_MIN_WIDTH);
    expect(keyboardSidebarWidth("End", false, 300)).toBe(SIDEBAR_MAX_WIDTH);
    expect(keyboardSidebarWidth("a", false, 300)).toBeUndefined();
  });

  it("round-trips the collapsed state through the cookie the server reads", () => {
    expect(sidebarOpenCookie(false)).toMatch(/^sidebar_state=false; path=\/; max-age=\d+$/);
    expect(parseSidebarOpen(sidebarOpenCookie(false).split(";")[0].split("=")[1])).toBe(false);
    expect(parseSidebarOpen("true")).toBe(true);
    expect(parseSidebarOpen(undefined)).toBeUndefined();
    expect(parseSidebarOpen("yes")).toBeUndefined();
  });
});
