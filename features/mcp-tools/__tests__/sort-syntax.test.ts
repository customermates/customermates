import { describe, expect, it } from "vitest";

import { compareCustomFieldValues } from "@/core/base/base-query-builder";

import { SORT_SYNTAX } from "../utils";

describe("sort syntax served by get_record_schema", () => {
  const en = new Intl.Collator("en-US");
  const high = "f3a1c0de-0000-4000-8000-000000000001";
  const low = "0b7e5a11-0000-4000-8000-000000000002";
  const retired = "9c2d4e33-0000-4000-8000-000000000003";
  const optionRank = new Map([
    [high, 0],
    [low, 1],
  ]);
  const sorted = (direction: "asc" | "desc") =>
    [retired, low, high].sort((a, b) => compareCustomFieldValues(a, b, direction, "singleSelect", en, optionRank));

  it("describes single-select sorting by option order, the way list sorting orders the options", () => {
    expect(sorted("asc")).toEqual([high, low, retired]);
    expect(sorted("desc")).toEqual([low, high, retired]);

    expect(SORT_SYNTAX.comparison.singleSelect).toContain("by option order");
    expect(SORT_SYNTAX.comparison.singleSelect).toContain("desc reverses it");
    expect(SORT_SYNTAX.comparison.singleSelect).toContain("after the known options in either direction");
    expect(SORT_SYNTAX.comparison.singleSelect).not.toContain("uuid");
  });
});
