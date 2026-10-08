import type { Filter, FilterableField } from "@/core/base/base-get.schema";
import type { ColumnPresentation } from "@/core/data-view/column-presentation.schema";

export type FilterTargetUpdate = {
  filters: Filter[];
  forceRefresh?: boolean;
  refreshMode?: "background";
};

export type FilterTarget = {
  readonly filters?: Filter[];
  readonly filterableFields: FilterableField[];
  readonly filterColumns?: ColumnPresentation[];
  setQueryOptions: (update: FilterTargetUpdate) => unknown;
  removeFilterAt: (index: number) => unknown;
};
