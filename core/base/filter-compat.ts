import type { Filter } from "./base-get.schema";

import { normalizeFilterNumberValueInput } from "./filter-value";

const RELATION_EXISTENCE_OPERATORS = new Set(["hasNone", "hasSome"]);

function normalizeLegacyRelationFilterInput(input: unknown): unknown {
  if (!input || typeof input !== "object" || Array.isArray(input)) return input;

  const filter = input as Record<string, unknown>;

  if (!Array.isArray(filter.value)) {
    if (!RELATION_EXISTENCE_OPERATORS.has(filter.operator as string)) return input;
    if (!("value" in filter) || filter.value !== undefined) return input;

    const withoutValue: Record<string, unknown> = { ...filter };
    delete withoutValue.value;

    return withoutValue;
  }

  if (filter.operator === "hasNone") return { ...filter, operator: "notIn" };
  if (filter.operator === "hasSome") return { ...filter, operator: "in" };

  return input;
}

export function normalizeFilterInput(input: unknown): unknown {
  return normalizeLegacyRelationFilterInput(normalizeFilterNumberValueInput(input));
}

export function normalizeFilter(filter: Filter): Filter {
  return normalizeFilterInput(filter) as Filter;
}

export function normalizeFilters(filters: Filter[]): Filter[] {
  return filters.map(normalizeFilter);
}
