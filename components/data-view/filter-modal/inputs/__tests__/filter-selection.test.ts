import { describe, expect, it } from "vitest";

import { nextFilterSelection } from "../filter-selection";

describe("nextFilterSelection", () => {
  it("allows the selection that reaches the limit", () => {
    expect(nextFilterSelection(["a"], "b", 2)).toEqual(["a", "b"]);
  });

  it("blocks an additional selection at the limit", () => {
    const selected = ["a", "b"];

    expect(nextFilterSelection(selected, "c", 2)).toBe(selected);
  });

  it("allows removal at the limit", () => {
    expect(nextFilterSelection(["a", "b"], "a", 2)).toEqual(["b"]);
  });

  it("allows a legacy over-limit selection to be reduced", () => {
    expect(nextFilterSelection(["a", "b", "c"], "b", 2)).toEqual(["a", "c"]);
  });
});
