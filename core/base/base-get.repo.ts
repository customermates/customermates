import type { SortableField, SearchableField } from "./base-query-builder";
import type { FilterableField, Filter, GetQueryParams, SortDescriptor } from "./base-get.schema";
import type { DateBucket } from "@/core/base/grouping/grouping.schema";
import type { GroupCountRow, GroupLabel } from "@/core/base/grouping/group-axis";
import type { GroupableFieldSpec } from "@/core/base/grouping/groupable-field";

export abstract class BaseGetRepo<T> {
  abstract getItems(params: GetQueryParams): Promise<T[]>;
  abstract getCount(params: GetQueryParams): Promise<number>;
  abstract getSortableFields(): SortableField[];
  abstract getSearchableFields(): SearchableField[];
  abstract getFilterableFields(): Promise<FilterableField[]>;
  filterableFieldsOnce(): Promise<FilterableField[]> {
    return this.getFilterableFields();
  }
  getGroupableFields(): Promise<GroupableFieldSpec[]> {
    return Promise.resolve([]);
  }
  countByGroup?(args: {
    spec: GroupableFieldSpec;
    params: GetQueryParams;
    bucket?: DateBucket;
    now?: string;
  }): Promise<GroupCountRow[]>;
  resolveGroupLabels?(spec: GroupableFieldSpec, keys: readonly string[]): Promise<Map<string, GroupLabel>>;
  collator(): Pick<Intl.Collator, "compare"> {
    return { compare: (left, right) => (left < right ? -1 : left > right ? 1 : 0) };
  }
  abstract validateFilters(args: { filters: Filter[] | undefined; filterableFields: FilterableField[] }): Filter[];
  abstract validateSortDescriptor(args: {
    sortDescriptor: SortDescriptor | undefined;
    sortableFields: SortableField[];
  }): SortDescriptor | undefined;
}
