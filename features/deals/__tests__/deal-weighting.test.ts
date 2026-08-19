import { describe, expect, it } from "vitest";

import { computeWeightedValue, readOptionWeights } from "../deal-weighting";

describe("readOptionWeights", () => {
  it("maps option values to their numeric weights", () => {
    const weights = readOptionWeights({
      options: [
        { value: "open", weight: 30 },
        { value: "won", weight: 100 },
        { value: "lost", weight: 0 },
      ],
    });

    expect([...weights.entries()]).toEqual([
      ["open", 30],
      ["won", 100],
      ["lost", 0],
    ]);
  });

  it("skips options that carry no weight so they stay unconfigured", () => {
    const weights = readOptionWeights({ options: [{ value: "open" }, { value: "won", weight: 100 }] });

    expect(weights.has("open")).toBe(false);
    expect(weights.get("won")).toBe(100);
  });

  it("skips options whose weight is not a finite number", () => {
    const weights = readOptionWeights({
      options: [
        { value: "a", weight: "30" },
        { value: "b", weight: Number.NaN },
        { value: "c", weight: Number.POSITIVE_INFINITY },
        { value: "d", weight: null },
      ],
    });

    expect(weights.size).toBe(0);
  });

  it("skips entries without a string value", () => {
    const weights = readOptionWeights({ options: [{ weight: 50 }, { value: 7, weight: 50 }] });

    expect(weights.size).toBe(0);
  });

  it("returns an empty map for shapes that are not a stored option list", () => {
    expect(readOptionWeights(null).size).toBe(0);
    expect(readOptionWeights(undefined).size).toBe(0);
    expect(readOptionWeights({}).size).toBe(0);
    expect(readOptionWeights({ options: null }).size).toBe(0);
    expect(readOptionWeights({ options: { currency: "eur" } }).size).toBe(0);
    expect(readOptionWeights([{ value: "open", weight: 30 }]).size).toBe(0);
  });
});

describe("computeWeightedValue", () => {
  it("discounts the total by the stage percentage", () => {
    expect(computeWeightedValue(50_000, 60)).toBe(30_000);
    expect(computeWeightedValue(342_000, 30)).toBe(102_600);
  });

  it("returns the full total at 100 percent", () => {
    expect(computeWeightedValue(212_000, 100)).toBe(212_000);
  });

  it("returns a measured zero for a zero-weight stage", () => {
    expect(computeWeightedValue(418_500, 0)).toBe(0);
  });

  it("returns null when the stage carries no weight, which is not a measured zero", () => {
    expect(computeWeightedValue(418_500, undefined)).toBeNull();
  });

  it("keeps a zero total at zero rather than null once a weight exists", () => {
    expect(computeWeightedValue(0, 60)).toBe(0);
  });
});
