import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { DEFAULT_FILTER_VALUE_KIND } from "@/core/types/filter-field-value-kind";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { FilterOperatorKey } from "@/core/base/base-query-builder";
import { resolveFilterValueClass } from "@/components/data-view/filter-modal/filter-value-class";

import { REPO_ROOT } from "./walk";

const SELECT_ITEMS = join(REPO_ROOT, "components/data-view/filter-modal/inputs/use-filter-select-items.tsx");

function fieldsWithSelectableValues(): Set<string> {
  const source = readFileSync(SELECT_ITEMS, "utf8");
  const cases = source.matchAll(/case FilterFieldKey\.([A-Za-z]+):/g);
  const mapped = source.matchAll(/\[FilterFieldKey\.([A-Za-z]+)\]:/g);
  return new Set([...cases, ...mapped].map((match) => match[1]));
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

  it("gives every enum filter field a picker rather than a free-text box", () => {
    const freeText = Object.values(FilterFieldKey).filter(
      (field) =>
        DEFAULT_FILTER_VALUE_KIND[field]?.kind === "enum" &&
        resolveFilterValueClass(field, FilterOperatorKey.in) !== "stringArray",
    );

    expect(
      freeText,
      `An enum filter field missing from RELATION_FILTER_FIELDS renders a free-text input in the filter modal, so the operator types a value instead of picking one and the filter never matches. Add:\n${freeText.join("\n")}`,
    ).toEqual([]);
  });

  it("gives every picker filter field a source of options, whatever its value kind", () => {
    const handled = fieldsWithSelectableValues();
    const missing = Object.values(FilterFieldKey).filter(
      (field) => resolveFilterValueClass(field, FilterOperatorKey.in) === "stringArray" && !handled.has(field),
    );

    expect(
      missing,
      `A field in RELATION_FILTER_FIELDS renders a picker, so it needs either a case in the select-items switch or an entry in fieldToGetItemsMap. Without one the picker is permanently empty, shows "No results found", and hasValidFilterConfiguration discards the draft so the filter can never be applied at all. This check is deliberately not limited to enum fields, because workspaceId is declared as a string kind and slipped past the enum-only guard. Add a source of options for:\n${missing.join("\n")}`,
    ).toEqual([]);
  });

  it("gives every date filter field a date input", () => {
    const wrong = Object.values(FilterFieldKey).filter(
      (field) =>
        DEFAULT_FILTER_VALUE_KIND[field]?.kind === "date" &&
        resolveFilterValueClass(field, FilterOperatorKey.gte) !== "isoDate",
    );

    expect(wrong, `Date filter fields missing from DATE_FILTER_FIELDS:\n${wrong.join("\n")}`).toEqual([]);
  });
});
