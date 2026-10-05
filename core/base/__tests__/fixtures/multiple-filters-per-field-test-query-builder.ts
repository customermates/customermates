import type { FilterableField } from "../../base-get.schema";
import { BaseQueryBuilder } from "../../base-query-builder";

export class TestQueryBuilder extends BaseQueryBuilder<Record<string, unknown>> {
  static filterableFields: FilterableField[] = [];

  override getFilterableFields(): Promise<FilterableField[]> {
    return Promise.resolve(TestQueryBuilder.filterableFields);
  }
}
