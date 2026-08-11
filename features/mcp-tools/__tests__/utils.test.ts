import { describe, expect, expectTypeOf, it } from "vitest";

import { formatForResponse } from "../utils";

describe("formatForResponse", () => {
  it("serializes Date values as stable UTC ISO strings throughout nested data", () => {
    const input = {
      createdAt: new Date("2025-03-30T00:30:00.000Z"),
      nested: [{ updatedAt: new Date("2025-10-26T01:30:00.000Z") }],
      tuple: [new Date("2024-01-02T03:04:05.000Z"), "kept"] as const,
    };

    const result = formatForResponse(input);

    expect(result).toEqual({
      createdAt: "2025-03-30T00:30:00.000Z",
      nested: [{ updatedAt: "2025-10-26T01:30:00.000Z" }],
      tuple: ["2024-01-02T03:04:05.000Z", "kept"],
    });
    expectTypeOf(result.createdAt).toEqualTypeOf<string>();
    expectTypeOf(result.nested[0].updatedAt).toEqualTypeOf<string>();
  });

  it("preserves existing ISO date strings, ISO datetimes, invalid strings, and primitives", () => {
    const input = {
      date: "2025-08-10",
      datetime: "2025-08-10T12:30:00.000Z",
      invalid: "August 10, 2025",
      count: 3,
      empty: null,
    };

    expect(formatForResponse(input)).toEqual(input);
  });

  it("serializes invalid Date objects deterministically without throwing", () => {
    expect(formatForResponse({ date: new Date(Number.NaN) })).toEqual({ date: "Invalid Date" });
  });
});
