import { ACTIVITY_KINDS } from "./activities.schema";
import type { RecordActivityQuery } from "./record-activities.schema";

export function recordActivityFilterCount(query: RecordActivityQuery) {
  return (
    (query.filters?.length ?? 0) +
    Number(Boolean(query.scope.records.length || query.scope.typeIds.length)) +
    Number(new Set(query.kinds).size < ACTIVITY_KINDS.length) +
    Number(Boolean(query.providers?.length)) +
    Number(Boolean(query.threadIds?.length)) +
    Number(Boolean(query.after)) +
    Number(Boolean(query.before))
  );
}

export function requestedRecordActivitySources(query: RecordActivityQuery) {
  const filters = query.filters ?? [];
  const accountFilter =
    Boolean(query.providers?.length) ||
    filters.some((filter) => filter.kind === "account" || filter.kind === "provider");
  const threadFilter =
    Boolean(query.threadIds?.length) || filters.some((filter) => filter.kind === "thread" && filter.operator === "in");
  return ACTIVITY_KINDS.filter(
    (kind) =>
      query.kinds.includes(kind) &&
      !(kind === "audit" && accountFilter) &&
      !(kind !== "message" && threadFilter) &&
      filters.every(
        (filter) =>
          filter.kind !== "source" ||
          (filter.operator === "in" ? filter.values.includes(kind) : !filter.values.includes(kind)),
      ),
  );
}
