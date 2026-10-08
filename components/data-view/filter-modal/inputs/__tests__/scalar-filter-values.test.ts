import { describe, expect, it } from "vitest";
import { validScalarFilterValue } from "../scalar-filter-values";

describe("scalar filter array tokens", () => {
  it("accepts canonical numeric and ISO date values without lossy coercion", () => {
    expect(validScalarFilterValue("9007199254740993.125", { id: "n", label: "Number", type: "number" })).toBe(true);
    expect(validScalarFilterValue("2026-02-28", { id: "d", label: "Date", type: "date" })).toBe(true);
    expect(validScalarFilterValue("2026-02-28T12:30:00Z", { id: "d", label: "Date", type: "dateTime" })).toBe(true);
  });
  it("rejects malformed numbers and nonexistent dates without changing their meaning", () => {
    for (const value of ["abc", "NaN", "Infinity", "1e3", "01", "1,5"])
      expect(validScalarFilterValue(value, { id: "n", label: "Number", type: "number" })).toBe(false);
    expect(validScalarFilterValue("2026-02-30", { id: "d", label: "Date", type: "date" })).toBe(false);
    expect(validScalarFilterValue("2026-02-28", { id: "d", label: "Date", type: "dateTime" })).toBe(false);
    expect(validScalarFilterValue("2026-02-28T12:30:00.1234567Z", { id: "d", label: "Date", type: "dateTime" })).toBe(
      false,
    );
  });
});
