import { describe, expect, it } from "vitest";

import { majority, percentile, signTestP } from "../classifier-eval/stats";

describe("classifier evaluation statistics", () => {
  it("computes the two-sided exact sign test", () => {
    expect(signTestP(7, 1)).toBeCloseTo(0.0703, 4);
    expect(signTestP(10, 2)).toBeCloseTo(0.0386, 4);
    expect(signTestP(0, 0)).toBe(1);
  });

  it("takes a strict majority and a nearest-rank percentile", () => {
    expect(majority([true, true, false])).toBe(true);
    expect(majority([true, false])).toBe(false);
    expect(percentile([5, 1, 4, 2, 3], 0.5)).toBe(3);
    expect(percentile([], 0.95)).toBeNull();
  });
});
