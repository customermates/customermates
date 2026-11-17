import type { Filter } from "@/core/base/base-get.schema";

import { FilterOperatorKey } from "@/core/base/base-query-builder";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { encodeGetParams } from "@/core/utils/get-params";
import { AUTOMATION_LIST_KINDS, type AutomationListKind } from "@/features/automation-rules/automations-list.schema";

type SearchParams = Record<string, string | string[] | undefined>;

const KIND_PARAM = "kind";

export function automationKindFilter(kind: AutomationListKind): Filter {
  return { field: FilterFieldKey.automationKind, operator: FilterOperatorKey.in, value: [kind] };
}

export function showsRoutinesOnly(filters: readonly Filter[] | undefined): boolean {
  return (filters ?? []).some(
    (filter) =>
      filter.field === FilterFieldKey.automationKind.toString() &&
      filter.operator === FilterOperatorKey.in &&
      filter.value.length === 1 &&
      filter.value[0] === "routine",
  );
}

export function canonicalAutomationsSearch(params: SearchParams): string | null {
  const requested = params[KIND_PARAM];
  if (requested === undefined) return null;

  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key === KIND_PARAM) continue;
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) search.append(key, item);
  }
  const kind = AUTOMATION_LIST_KINDS.find((candidate) => candidate === requested);
  if (kind && params.filters === undefined)
    for (const [key, value] of encodeGetParams({ filters: [automationKindFilter(kind)] })) search.append(key, value);
  return search.toString();
}
