import type { Filter } from "./base-get.schema";

export function normalizeLegacyRelationFilterInput(input: unknown): unknown {
  if (!input || typeof input !== "object" || Array.isArray(input)) return input;

  const filter = input as Record<string, unknown>;
  if (!Array.isArray(filter.value)) return input;

  if (filter.operator === "hasNone") return { ...filter, operator: "notIn" };
  if (filter.operator === "hasSome") return { ...filter, operator: "in" };

  return input;
}

export function normalizeLegacyRelationFilter(filter: Filter): Filter {
  return normalizeLegacyRelationFilterInput(filter) as Filter;
}

export function normalizeLegacyRelationFilters(filters: Filter[]): Filter[] {
  return filters.map(normalizeLegacyRelationFilter);
}
