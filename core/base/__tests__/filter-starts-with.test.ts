import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { FilterOperatorKey, defaultValidateFilters } from "@/core/base/base-query-builder";
import { FilterSchema } from "@/core/base/base-get.schema";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { FILTER_FIELD_DEFAULT_OPERATORS } from "@/core/types/filter-field-operators";
import { DEFAULT_FILTER_VALUE_KIND } from "@/core/types/filter-field-value-kind";

describe("startsWith filter operator", () => {
  it("is accepted by the request schema as a single-value filter", () => {
    const parsed = FilterSchema.safeParse({
      field: FilterFieldKey.name,
      operator: FilterOperatorKey.startsWith,
      value: "Renewal-",
    });
    expect(parsed.success).toBe(true);
  });

  it("is offered on every new text field, in all three registries", () => {
    for (const field of [FilterFieldKey.name, FilterFieldKey.firstName, FilterFieldKey.lastName]) {
      expect(FILTER_FIELD_DEFAULT_OPERATORS[field], `${field} operators`).toContain(FilterOperatorKey.startsWith);
      expect(DEFAULT_FILTER_VALUE_KIND[field], `${field} value kind`).toEqual({ kind: "string" });
    }
  });

  it("survives validation on a field that offers it", () => {
    const filter = FilterSchema.parse({
      field: FilterFieldKey.name,
      operator: FilterOperatorKey.startsWith,
      value: "Renewal-",
    });
    const kept = defaultValidateFilters({
      filters: [filter as never],
      filterableFields: [
        { field: FilterFieldKey.name, operators: FILTER_FIELD_DEFAULT_OPERATORS[FilterFieldKey.name] },
      ] as never,
    });
    expect(kept).toHaveLength(1);
    expect(kept[0]).toMatchObject({ operator: FilterOperatorKey.startsWith, value: "Renewal-" });
  });

  it("is dropped on a field that does not offer it, rather than reaching the query", () => {
    const filter = FilterSchema.parse({
      field: FilterFieldKey.workspaceTags,
      operator: FilterOperatorKey.startsWith,
      value: "x",
    });
    const kept = defaultValidateFilters({
      filters: [filter as never],
      filterableFields: [
        {
          field: FilterFieldKey.workspaceTags,
          operators: FILTER_FIELD_DEFAULT_OPERATORS[FilterFieldKey.workspaceTags],
        },
      ] as never,
    });
    expect(kept).toHaveLength(0);
  });

  it("emits a bounded prefix condition in the built query, not an unfiltered match", () => {
    const source = readFileSync(join(process.cwd(), "core/base/base-query-builder.ts"), "utf8");
    expect(source).toMatch(
      /case FilterOperatorKey\.startsWith:\s*\n\s*return \{ startsWith: filter\.value, mode: "insensitive" \};/,
    );
  });
});
