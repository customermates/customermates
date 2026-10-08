import type { Filter, FilterableField } from "@/core/base/base-get.schema";
import type { ColumnPresentation } from "@/core/data-view/column-presentation.schema";

export type FilterTargetUpdate = {
  filters: Filter[];
  forceRefresh?: boolean;
  refreshMode?: "background";
};

export type FilterTargetGroup = {
  id: string;
  label: string;
  target: FilterTarget;
  mode: string;
  modes: { value: string; label: string }[];
  setMode: (mode: string) => void;
  remove: () => void;
};

export type FilterTarget = {
  readonly isDisabled?: boolean;
  readonly identity?: unknown;
  readonly discardPendingOnDispose?: boolean;
  readonly scopeKey?: string;
  openField?: (field: string) => { group: FilterTargetGroup; field: string } | undefined;
  readonly groups?: FilterTargetGroup[];
  readonly maxFilters?: number;
  readonly uniqueFields?: string[];
  canAddField?: (field: string) => boolean;
  readonly filters?: Filter[];
  readonly filterableFields: FilterableField[];
  readonly filterColumns?: ColumnPresentation[];
  setQueryOptions: (update: FilterTargetUpdate) => unknown;
  removeFilterAt: (index: number) => unknown;
};
