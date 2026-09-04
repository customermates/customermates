import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { DEFAULT_FILTER_VALUE_KIND } from "@/core/types/filter-field-value-kind";
import { FILTER_FIELD_DEFAULT_OPERATORS } from "@/core/types/filter-field-operators";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { FilterOperatorKey } from "@/core/base/base-query-builder";
import { resolveFilterValueClass } from "@/components/data-view/filter-modal/filter-value-class";

import { REPO_ROOT } from "./walk";

const SELECT_ITEMS = join(REPO_ROOT, "components/data-view/filter-modal/inputs/use-filter-select-items.tsx");

function optionSourceEntries(): Map<string, "source" | "none"> {
  const source = readFileSync(SELECT_ITEMS, "utf8");
  const registry = source.slice(source.indexOf("export function filterOptionSources("));
  const entries = registry.matchAll(/\[FilterFieldKey\.([A-Za-z]+)\]: (NO_FILTER_OPTIONS|\{)/g);
  return new Map([...entries].map((match) => [match[1], match[2] === "{" ? "source" : "none"]));
}

function rendersPicker(field: FilterFieldKey): boolean {
  return FILTER_FIELD_DEFAULT_OPERATORS[field].some(
    (operator) => resolveFilterValueClass(field, operator) === "stringArray",
  );
}

describe("filter field select items", () => {
  it("registers every filter field exactly once in the option source registry", () => {
    const entries = optionSourceEntries();
    const missing = Object.values(FilterFieldKey).filter((field) => !entries.has(field));

    expect(
      missing,
      `filterOptionSources is typed as Record<FilterFieldKey, FilterOptionSource>, so a missing key is a typecheck error; this scrape only guards the pattern the tests below rely on. Missing:\n${missing.join("\n")}`,
    ).toEqual([]);
  });

  it("gives every enum filter field a picker rather than a free-text box", () => {
    const freeText = Object.values(FilterFieldKey).filter(
      (field) => DEFAULT_FILTER_VALUE_KIND[field]?.kind === "enum" && !rendersPicker(field),
    );

    expect(
      freeText,
      `An enum filter field whose declared operators never resolve to the multi-select renders a free-text input in the filter modal, so the operator types a value instead of picking one and the filter never matches. Check FILTER_FIELD_DEFAULT_OPERATORS for:\n${freeText.join("\n")}`,
    ).toEqual([]);
  });

  it("gives every picker filter field a source of options, whatever its value kind", () => {
    const entries = optionSourceEntries();
    const missing = Object.values(FilterFieldKey).filter(
      (field) => rendersPicker(field) && entries.get(field) !== "source",
    );

    expect(
      missing,
      `A field that renders the multi-select for one of its declared operators needs a getItems loader or a static items list in filterOptionSources, not NO_FILTER_OPTIONS. Without one the picker is permanently empty, shows "No results found", and hasValidFilterConfiguration discards the draft so the filter can never be applied at all. This check is deliberately not limited to enum fields, because workspaceId and calendarId are declared as a string kind. Add a source of options for:\n${missing.join("\n")}`,
    ).toEqual([]);
  });

  it("gives no option source to a field that never renders a picker", () => {
    const entries = optionSourceEntries();
    const stray = Object.values(FilterFieldKey).filter(
      (field) => !rendersPicker(field) && entries.get(field) === "source",
    );

    expect(
      stray,
      `A field with an option source but no operator that renders the multi-select loads options nobody can pick. Map it to NO_FILTER_OPTIONS or declare a selectable operator for:\n${stray.join("\n")}`,
    ).toEqual([]);
  });

  it("gives every date filter field a date input", () => {
    const wrong = Object.values(FilterFieldKey).filter(
      (field) =>
        DEFAULT_FILTER_VALUE_KIND[field]?.kind === "date" &&
        resolveFilterValueClass(field, FilterOperatorKey.gte) !== "isoDate",
    );

    expect(wrong, `Date filter fields that do not resolve to a date input:\n${wrong.join("\n")}`).toEqual([]);
  });
});
