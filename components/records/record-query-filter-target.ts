import type { Filter, FilterableField } from "@/core/base/base-get.schema";
import type { ColumnPresentation } from "@/core/data-view/column-presentation.schema";
import type { FilterTarget, FilterTargetGroup } from "@/components/data-view/filter-palette/filter-target";
import type { RecordModelView } from "@/features/records/record-model.schema";
import type { RecordPathStep } from "@/features/records/record-relationship-path.schema";
import type { QueryFilters } from "@/features/records/record-filter-target";
import equal from "fast-deep-equal";
import { FilterOperatorKey as Op } from "@/core/base/base-query-builder";
import {
  recordFilterTarget,
  recordFilterPathEnd,
  recordQueryToPaletteFilters,
  paletteFiltersToRecordQuery,
  parseRelatedFieldKey,
  parseRelatedRecordKey,
} from "@/features/records/record-filter-target";

type Labels = {
  createdAt: string;
  updatedAt: string;
  assignedTo: string;
  search: string;
  records: string;
  any: string;
  none: string;
  unavailable: string;
};
type Related = NonNullable<QueryFilters["relatedFilters"]>[number];
type Options = {
  model: RecordModelView;
  typeId: string;
  labels: Labels;
  read: () => QueryFilters;
  write: (query: QueryFilters) => void;
  isDisabled: () => boolean;
  identity: () => unknown;
};
const SEARCH = "query:search";
const RECORDS = "query:records";

export function createRecordQueryFilterTarget(options: Options): FilterTarget {
  const { model, typeId, labels, read, write } = options;
  const metadata = () => recordFilterTarget(model, typeId, labels, read());
  const scalarFilters = (query: QueryFilters) => recordQueryToPaletteFilters({ ...query, relatedFilters: [] }).filters;
  const withSearch = (query: QueryFilters): Filter[] => [
    ...scalarFilters(query),
    ...(query.search ? [{ field: SEARCH, operator: Op.contains, value: query.search } as const] : []),
  ];
  const convert = (filters: Filter[], original: QueryFilters): QueryFilters => {
    const query = paletteFiltersToRecordQuery(
      filters.filter((filter) => filter.field !== SEARCH && filter.field !== RECORDS),
      [],
      model,
    );
    const preserved = original.filters.filter((filter) => {
      if (
        filter.fieldId.startsWith("system:") ||
        model.fields.some((field) => field.id === filter.fieldId && !field.archived)
      )
        return false;
      const previous = scalarFilters({ filters: [filter], relationships: [] })[0];
      return previous && filters.some((candidate) => equal(candidate, previous));
    });
    const search = filters.find((filter) => filter.field === SEARCH);
    return {
      ...query,
      filters: [...query.filters, ...preserved],
      search: search && "value" in search ? String(search.value) : undefined,
    };
  };
  function relatedGroup(path: RecordPathStep[], index?: number): FilterTargetGroup {
    const end = recordFilterPathEnd(model, typeId, path);
    const initial: Related = { path, operator: "any", filters: [], relationships: [] };
    const current = () => (index === undefined ? initial : (read().relatedFilters?.[index] ?? initial));
    const change = (next: Related) => {
      if (options.isDisabled()) return;
      const query = read();
      const groups = [...(query.relatedFilters ?? [])];
      if (index === undefined) {
        index = groups.length;
        groups.push(next);
      } else groups[index] = next;
      write({ ...query, relatedFilters: groups });
    };
    const target: FilterTarget = {
      uniqueFields: [SEARCH, RECORDS],
      get isDisabled() {
        return options.isDisabled();
      },
      get filters() {
        const value = current();
        return [
          ...withSearch(value),
          ...(value.recordIds !== undefined
            ? [{ field: RECORDS, operator: Op.in, value: value.recordIds } as const]
            : []),
        ];
      },
      get filterableFields() {
        return [
          ...(end
            ? recordFilterTarget(model, end.typeId, labels).filterableFields.filter(
                (field) => !parseRelatedFieldKey(field.field) && !parseRelatedRecordKey(field.field),
              )
            : []),
          ...(current().search !== undefined
            ? [{ field: SEARCH, label: labels.search, operators: [Op.contains] }]
            : []),
          { field: RECORDS, label: labels.records, operators: [Op.in] },
        ];
      },
      get filterColumns(): ColumnPresentation[] {
        return [
          ...(end ? recordFilterTarget(model, end.typeId, labels).filterColumns : []),
          { id: SEARCH, label: labels.search, type: "plain" },
          ...(end
            ? [{ id: RECORDS, label: labels.records, type: "recordReference" as const, typeId: end.typeId }]
            : []),
        ];
      },
      setQueryOptions({ filters }) {
        if (options.isDisabled()) return;
        const value = current();
        const selected = filters.find((filter) => filter.field === RECORDS);
        const next = { ...value, ...convert(filters, value) };
        delete next.relatedFilters;
        change({
          ...next,
          recordIds: selected && "value" in selected && Array.isArray(selected.value) ? selected.value : undefined,
        });
      },
      removeFilterAt(offset) {
        this.setQueryOptions({ filters: this.filters?.filter((_, i) => i !== offset) ?? [] });
      },
    };
    return {
      id:
        index === undefined
          ? `new-${path.map((step) => `${step.relationId}-${step.direction}`).join("-")}`
          : String(index),
      label: end?.label ?? labels.unavailable,
      target,
      get mode() {
        return current().operator;
      },
      modes: [
        { value: "any", label: labels.any },
        { value: "none", label: labels.none },
      ],
      setMode(mode) {
        if (mode === "any" || mode === "none") change({ ...current(), operator: mode });
      },
      remove() {
        if (!options.isDisabled() && index !== undefined)
          write({ ...read(), relatedFilters: read().relatedFilters?.filter((_, i) => i !== index) });
      },
    };
  }
  const target: FilterTarget = {
    discardPendingOnDispose: true,
    uniqueFields: [SEARCH],
    canAddField: (field) =>
      field === SEARCH ||
      (parseRelatedFieldKey(field) || parseRelatedRecordKey(field)
        ? (read().relatedFilters?.length ?? 0) < 16
        : withSearch(read()).length < 50),
    get identity() {
      return options.identity();
    },
    scopeKey: typeId,
    get isDisabled() {
      return options.isDisabled();
    },
    get filters() {
      return withSearch(read());
    },
    get groups() {
      return (read().relatedFilters ?? []).map((group, index) => relatedGroup(group.path, index));
    },
    get filterableFields(): FilterableField[] {
      return [...metadata().filterableFields, { field: SEARCH, label: labels.search, operators: [Op.contains] }];
    },
    get filterColumns(): ColumnPresentation[] {
      return [...metadata().filterColumns, { id: SEARCH, label: labels.search, type: "plain" }];
    },
    openField(field) {
      const related = parseRelatedFieldKey(field);
      const path = related?.path ?? parseRelatedRecordKey(field);
      return path ? { group: relatedGroup(path), field: related?.fieldId ?? RECORDS } : undefined;
    },
    setQueryOptions({ filters, forceRefresh }) {
      if (options.isDisabled()) return;
      const original = read();
      const next = convert(filters, original);
      write({ ...original, ...next, relatedFilters: forceRefresh ? [] : original.relatedFilters });
    },
    removeFilterAt(index) {
      this.setQueryOptions({ filters: this.filters?.filter((_, i) => i !== index) ?? [] });
    },
  };
  return target;
}
