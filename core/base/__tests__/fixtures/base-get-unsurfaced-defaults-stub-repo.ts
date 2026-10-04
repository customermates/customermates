import type { CustomColumnDto } from "@/core/data-view/column-presentation.schema";
import type { Filter, FilterableField, GetQueryParams, SortDescriptor } from "../../base-get.schema";
import { BaseGetRepo } from "@/core/base/base-get.repo";

type Item = { id: string };

export class StubRepo extends BaseGetRepo<Item> {
  itemCalls: GetQueryParams[] = [];

  getItems(params: GetQueryParams): Promise<Item[]> {
    this.itemCalls.push(params);
    return Promise.resolve([]);
  }

  getCount(): Promise<number> {
    return Promise.resolve(0);
  }

  getSortableFields() {
    return [{ field: "createdAt", resolvedFields: ["createdAt"] }];
  }

  getSearchableFields() {
    return [];
  }

  getFilterableFields(): Promise<FilterableField[]> {
    return Promise.resolve([]);
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
