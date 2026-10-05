import type { FilterableField } from "@/core/base/base-get.schema";
import type { SearchableField, SortableField } from "@/core/base/base-query-builder";
import type { GroupableFieldSpec } from "@/core/base/grouping/groupable-field";
import type { CustomColumnDto } from "@/core/data-view/column-presentation.schema";

export abstract class DataViewConfigurationRepo {
  abstract getSearchableFields(): SearchableField[];
  abstract getSortableFields(): SortableField[];
  abstract getFilterableFields(): Promise<FilterableField[]>;
  abstract getCustomColumns(): Promise<CustomColumnDto[]>;
  abstract getGroupableFields(customColumns?: readonly CustomColumnDto[]): Promise<GroupableFieldSpec[]>;
}
