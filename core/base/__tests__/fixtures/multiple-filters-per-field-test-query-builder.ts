import type { FilterableField } from "../../base-get.schema";
import { QueryRepository } from "../../query-repository";

export class TestQueryBuilder extends QueryRepository<Record<string, unknown>> {
  static filterableFields: FilterableField[] = [];

  override getFilterableFields(): Promise<FilterableField[]> {
    return Promise.resolve(TestQueryBuilder.filterableFields);
  }
}
