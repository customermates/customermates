import { describe, expect, it } from "vitest";

import { STEADY_LABEL_MIN_MS, steadyLabelDelay } from "../use-steady-label";

describe("steady activity label", () => {
  it("waits out the remainder of the window when a label arrives early", () => {
    expect(steadyLabelDelay(1_000, 1_100, 700)).toBe(600);
  });

  it("swaps at once once the shown label has had its time", () => {
    expect(steadyLabelDelay(1_000, 1_700, 700)).toBe(0);
    expect(steadyLabelDelay(1_000, 9_999, 700)).toBe(0);
  });

  it("never asks for a negative delay, which would swap on a stale timer", () => {
    expect(steadyLabelDelay(5_000, 1_000, 700)).toBeGreaterThanOrEqual(0);
  });

  it("holds long enough for a tool call that finishes in milliseconds to stay readable", () => {
    expect(steadyLabelDelay(0, 40, STEADY_LABEL_MIN_MS)).toBe(STEADY_LABEL_MIN_MS - 40);
  });
});
