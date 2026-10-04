import type { CustomColumnDto } from "@/core/data-view/column-presentation.schema";
import type { FilterableField } from "../../base-get.schema";
import { BaseQueryBuilder } from "../../base-query-builder";

export class TestQueryBuilder extends BaseQueryBuilder<Record<string, unknown>> {
  static filterableFields: FilterableField[] = [];
  static customColumns: CustomColumnDto[] = [];

  override getFilterableFields(): Promise<FilterableField[]> {
    return Promise.resolve(TestQueryBuilder.filterableFields);
  }

  override getCustomColumns(): Promise<CustomColumnDto[]> {
    return Promise.resolve(TestQueryBuilder.customColumns);
  }
}
