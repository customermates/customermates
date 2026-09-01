import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { DEFAULT_FILTER_VALUE_KIND } from "@/core/types/filter-field-value-kind";
import { FilterFieldKey } from "@/core/types/filter-field-key";

import { REPO_ROOT } from "./walk";

const SELECT_ITEMS = join(REPO_ROOT, "components/data-view/filter-modal/inputs/use-filter-select-items.tsx");

function fieldsWithSelectableValues(): Set<string> {
  const source = readFileSync(SELECT_ITEMS, "utf8");
  const cases = source.matchAll(/case FilterFieldKey\.([A-Za-z]+):/g);
  return new Set([...cases].map((match) => match[1]));
}

describe("filter field select items", () => {
  it("gives every enum filter field a case that produces its selectable values", () => {
    const handled = fieldsWithSelectableValues();
    const missing = Object.values(FilterFieldKey).filter(
      (field) => DEFAULT_FILTER_VALUE_KIND[field]?.kind === "enum" && !handled.has(field),
    );

    expect(
      missing,
      `An enum filter field with no case in use-filter-select-items.tsx falls through to an empty option list. The filter modal then offers nothing to pick, and an applied chip renders as "Filter not available" even though the query itself is correct. Add a case for:\n${missing.join("\n")}`,
    ).toEqual([]);
  });
});
