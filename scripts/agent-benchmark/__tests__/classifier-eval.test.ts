import { describe, expect, it } from "vitest";

import { canonicalFigure, extractFigures } from "../classifier-eval/figures";
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

describe("figure extraction", () => {
  it("normalizes grouped and decimal figures", () => {
    expect(canonicalFigure("51,800")).toBe("51800");
    expect(canonicalFigure("51.800")).toBe("51800");
    expect(canonicalFigure("12,5")).toBe("12.5");
    expect(canonicalFigure("1,2,3")).toBeNull();
  });

  it("skips prompt figures, years, identifiers and list markers", () => {
    const answer = [
      "Across 2026 there are 511 open deals, median EUR 51,800.",
      "1. Request 007 is open",
      "2. Atlas-017 has 3 tasks",
      "RESULT count=511 medianEur=51800 ceiling=150",
    ].join("\n");

    expect(extractFigures(answer, "at least EUR 150 per unit")).toEqual([
      "511",
      "51,800",
      "3",
    ]);
  });
});
