import { afterEach, describe, expect, it, vi } from "vitest";

import { handOffSheet, isSheetHandoff } from "../overlay-contract";

afterEach(() => {
  vi.useRealTimers();
});

describe("sheet handoff", () => {
  it("lets the next sheet swap in place only right after a handoff", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-09T12:00:00Z"));
    expect(isSheetHandoff()).toBe(false);

    handOffSheet();
    expect(isSheetHandoff()).toBe(true);

    vi.advanceTimersByTime(599);
    expect(isSheetHandoff()).toBe(true);

    vi.advanceTimersByTime(2);
    expect(isSheetHandoff()).toBe(false);
  });
});
