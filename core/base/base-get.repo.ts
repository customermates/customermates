import type { SortableField, SearchableField } from "./base-query-builder";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { FilterableField, Filter, GetQueryParams, SortDescriptor } from "./base-get.schema";
import type { DateBucket } from "@/core/base/grouping/grouping.schema";
import type { GroupCountRow } from "@/core/base/grouping/group-count";
import type { GroupLabel } from "@/core/base/grouping/group-labels";
import type { EntityType } from "@/generated/prisma";
import type { GroupableFieldSpec } from "@/core/base/grouping/groupable-field";
import type { NumericFieldSums, SummableModel } from "./base-repository";

export abstract class BaseGetRepo<T> {
  abstract getItems(params: GetQueryParams): Promise<T[]>;
  abstract getCount(params: GetQueryParams): Promise<number>;
  abstract getSortableFields(): SortableField[];
  abstract getSearchableFields(): SearchableField[];
  abstract getFilterableFields(): Promise<FilterableField[]>;
  abstract getCustomColumns(): Promise<CustomColumnDto[]>;
  customColumnsOnce(): Promise<CustomColumnDto[]> {
    return this.getCustomColumns();
  }
  filterableFieldsOnce(): Promise<FilterableField[]> {
    return this.getFilterableFields();
  }
  getGroupableFields(_customColumns?: readonly CustomColumnDto[]): Promise<GroupableFieldSpec[]> {
    return Promise.resolve([]);
  }
  countByGroup(_args: {
    spec: GroupableFieldSpec;
    params: GetQueryParams;
    bucket?: DateBucket;
    sumFields?: readonly string[];
    now?: string;
  }): Promise<GroupCountRow[]> {
    throw new Error("countByGroup is not implemented on this repository");
  }
  resolveGroupLabels(_spec: GroupableFieldSpec, _keys: readonly string[]): Promise<Map<string, GroupLabel>> {
    return Promise.resolve(new Map());
  }
  collator(): Pick<Intl.Collator, "compare"> {
    return { compare: (left, right) => (left < right ? -1 : left > right ? 1 : 0) };
  }
  abstract validateFilters(args: { filters: Filter[] | undefined; filterableFields: FilterableField[] }): Filter[];
  abstract validateSortDescriptor(args: {
    sortDescriptor: SortDescriptor | undefined;
    sortableFields: SortableField[];
    customColumns?: CustomColumnDto[];
  }): SortDescriptor | undefined;
  abstract sumNumericFields<F extends string>(opts: {
    model: SummableModel;
    fields: readonly F[];
    params: GetQueryParams;
  }): Promise<NumericFieldSums<F>>;

  sumCustomColumnValues(_opts: {
    entityType: EntityType;
    columnIds: readonly string[];
    params: GetQueryParams;
  }): Promise<Record<string, number>> {
    return Promise.resolve({});
  }
}
