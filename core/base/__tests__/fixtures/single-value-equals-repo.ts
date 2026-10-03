import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { Filter, FilterableField, SortDescriptor } from "../../base-get.schema";
import { BaseGetRepo } from "@/core/base/base-get.repo";

const SELECT_COLUMN = "11111111-1111-4111-8111-111111111111";

const FIELDS: FilterableField[] = [
  { field: SELECT_COLUMN, operators: ["in", "notIn", "isNull", "isNotNull"] as FilterableField["operators"] },
  { field: "name", operators: ["equals", "startsWith", "contains"] as FilterableField["operators"] },
];

export class Repo extends BaseGetRepo<{ id: string }> {
  validated: Filter[] | undefined;
  getItems() {
    return Promise.resolve([]);
  }
  getCount() {
    return Promise.resolve(0);
  }
  getSortableFields() {
    return [];
  }
  getSearchableFields() {
    return [];
  }
  getFilterableFields(): Promise<FilterableField[]> {
    return Promise.resolve(FIELDS);
  }
  getCustomColumns(): Promise<CustomColumnDto[]> {
    return Promise.resolve([]);
  }
  validateFilters({ filters }: { filters: Filter[] | undefined }): Filter[] {
    this.validated = filters;
    return filters ?? [];
  }
  validateSortDescriptor(): SortDescriptor | undefined {
    return undefined;
  }
  sumNumericFields() {
    return Promise.resolve({});
  }
}
