import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { Filter, FilterableField, GetQueryParams, SortDescriptor } from "../../base-get.schema";
import { BaseGetRepo } from "@/core/base/base-get.repo";

type Item = { id: string; totalValue: number };

export class StubRepo extends BaseGetRepo<Item> {
  sumCalls: GetQueryParams[] = [];
  customSumCalls: (readonly string[])[] = [];

  constructor(
    private sums: Record<string, number>,
    private customColumns: CustomColumnDto[] = [],
  ) {
    super();
  }

  getItems(): Promise<Item[]> {
    return Promise.resolve([{ id: "one", totalValue: 10 }]);
  }

  getCount(): Promise<number> {
    return Promise.resolve(1);
  }

  getSortableFields() {
    return [];
  }

  getSearchableFields() {
    return [];
  }

  getFilterableFields(): Promise<FilterableField[]> {
    return Promise.resolve([]);
  }

  getCustomColumns(): Promise<CustomColumnDto[]> {
    return Promise.resolve(this.customColumns);
  }

  validateFilters(): Filter[] {
    return [];
  }

  validateSortDescriptor(): SortDescriptor | undefined {
    return undefined;
  }

  sumNumericFields<F extends string>(opts: { params: GetQueryParams }): Promise<Partial<Record<F, number | null>>> {
    this.sumCalls.push(opts.params);
    return Promise.resolve(this.sums as Partial<Record<F, number | null>>);
  }

  sumCustomColumnValues(opts: { columnIds: readonly string[] }): Promise<Record<string, number>> {
    this.customSumCalls.push(opts.columnIds);
    return Promise.resolve(Object.fromEntries(opts.columnIds.map((columnId, index) => [columnId, 1000 * (index + 1)])));
  }
}
