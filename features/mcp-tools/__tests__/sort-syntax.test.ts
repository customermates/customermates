import { describe, expect, it } from "vitest";

import { SORT_SYNTAX } from "../utils";

describe("sort syntax served by get_record_schema", () => {
  it("describes single-select sorting by option order", () => {
    expect(SORT_SYNTAX.comparison.singleSelect).toContain("by option order");
    expect(SORT_SYNTAX.comparison.singleSelect).toContain("desc reverses it");
    expect(SORT_SYNTAX.comparison.singleSelect).toContain("after the known options in either direction");
    expect(SORT_SYNTAX.comparison.singleSelect).not.toContain("uuid");
  });
});
