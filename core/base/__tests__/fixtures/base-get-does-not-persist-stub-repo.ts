import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { Filter, FilterableField, GetQueryParams, SortDescriptor } from "../../base-get.schema";
import { BaseGetRepo } from "@/core/base/base-get.repo";
import { FilterOperatorKey } from "../../base-query-builder";

type Item = { id: string };

export class StubRepo extends BaseGetRepo<Item> {
  itemCalls: GetQueryParams[] = [];

  getItems(params: GetQueryParams): Promise<Item[]> {
    this.itemCalls.push(params);
    return Promise.resolve([{ id: "one" }]);
  }

  getCount(): Promise<number> {
    return Promise.resolve(1);
  }

  getSortableFields() {
    return [
      { field: "createdAt", resolvedFields: ["createdAt"] },
      { field: "name", resolvedFields: ["name"] },
    ];
  }

  getSearchableFields() {
    return [];
  }

  getFilterableFields(): Promise<FilterableField[]> {
    return Promise.resolve([{ field: "firstName", operators: [FilterOperatorKey.contains] }]);
  }

  getCustomColumns(): Promise<CustomColumnDto[]> {
    return Promise.resolve([]);
  }

  validateFilters({ filters }: { filters: Filter[] | undefined }): Filter[] {
    return filters ?? [];
  }

  validateSortDescriptor({ sortDescriptor }: { sortDescriptor: SortDescriptor | undefined }) {
    return sortDescriptor;
  }

  sumNumericFields<F extends string>(): Promise<Partial<Record<F, number | null>>> {
    return Promise.resolve({} as Partial<Record<F, number | null>>);
  }
}
