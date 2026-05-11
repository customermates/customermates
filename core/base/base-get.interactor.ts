import type { Validated } from "../validation/validation.utils";
import type { SortableField, SearchableField } from "./base-query-builder";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { P13nEntry, SavedFilterPreset } from "@/features/p13n/prisma-p13n.repository";
import type { UpsertP13nData } from "@/features/p13n/upsert-p13n.interactor";
import type {
  FilterableField,
  Filter,
  GetQueryParams,
  GroupedPaginationRequest,
  PaginationRequest,
  PaginationResponse,
  SortDescriptor,
} from "./base-get.schema";

import { CustomColumnType } from "@/generated/prisma";

import { IS_DEMO_MODE } from "@/constants/env";
import { KANBAN_EMPTY_GROUP_KEY, KANBAN_PER_GROUP_DEFAULT } from "./base-get.schema";
import { FilterOperatorKey, ViewMode } from "./base-query-builder";

export interface GetResult<T> {
  p13nId?: string;
  items: T[];
  customColumns?: CustomColumnDto[];
  filters?: Filter[];
  searchTerm?: string;
  sortDescriptor?: SortDescriptor;
  pagination?: PaginationResponse;
  filterableFields?: FilterableField[];
  columnOrder?: string[];
  columnWidths?: Record<string, number>;
  hiddenColumns?: string[];
  savedFilterPresets?: SavedFilterPreset[];
  viewMode?: ViewMode;
  groupingColumnId?: string;
  groupCounts?: Record<string, number>;
}

export abstract class P13nRepo {
  abstract getP13n(p13nId: string): Promise<P13nEntry | undefined>;
  abstract upsertP13n(data: UpsertP13nData): Promise<P13nEntry>;
}

export abstract class BaseGetRepo<T> {
  abstract getItems(params: GetQueryParams): Promise<T[]>;
  abstract getCount(params: GetQueryParams): Promise<number>;
  abstract getSortableFields(): SortableField[];
  abstract getSearchableFields(): SearchableField[];
  abstract getFilterableFields(): Promise<FilterableField[]>;
  abstract getCustomColumns(): Promise<CustomColumnDto[]>;
  abstract validateFilters(filters: Filter[] | undefined, filterableFields: FilterableField[]): Filter[];
  abstract validateSortDescriptor(
    sortDescriptor: SortDescriptor | undefined,
    sortableFields: SortableField[],
    customColumns?: CustomColumnDto[],
  ): SortDescriptor | undefined;
}

type BaseQuery = { filters?: Filter[]; searchTerm?: string; sortDescriptor?: SortDescriptor };

type SingleSelectColumn = Extract<CustomColumnDto, { type: typeof CustomColumnType.singleSelect }>;

type FetchResult<T> = { items: T[]; total: number; groupCounts?: Record<string, number> };

export abstract class BaseGetInteractor<T> {
  constructor(
    protected repo: BaseGetRepo<T>,
    protected p13nRepo: P13nRepo,
    protected defaultParams?: GetQueryParams,
  ) {}

  async invoke(params: GetQueryParams = {}): Validated<GetResult<T>> {
    const { p13nId } = params;

    let searchTerm = params.searchTerm;
    let sortDescriptor = params.sortDescriptor;
    let pagination = params.pagination;
    let filters = params.filters;

    const hasUrlQueryState =
      filters !== undefined || searchTerm !== undefined || sortDescriptor !== undefined || pagination !== undefined;

    let columnOrder: string[] | undefined = undefined;
    let columnWidths: Record<string, number> | undefined = undefined;
    let hiddenColumns: string[] | undefined = undefined;
    let viewMode: ViewMode | undefined = undefined;
    let groupingColumnId: string | undefined = undefined;
    let savedFilterPresets: SavedFilterPreset[] | undefined = undefined;

    if (p13nId) {
      const p13nData = await this.p13nRepo.getP13n(p13nId);

      if (p13nData) {
        if (!hasUrlQueryState) {
          filters = p13nData.filters;
          searchTerm = p13nData.searchTerm;
          sortDescriptor = p13nData.sortDescriptor;
          pagination = p13nData.pagination;
        }

        columnOrder = p13nData.columnOrder;
        columnWidths = p13nData.columnWidths;
        hiddenColumns = p13nData.hiddenColumns;
        savedFilterPresets = p13nData.savedFilterPresets;
        viewMode = p13nData.viewMode;
        groupingColumnId = p13nData.groupingColumnId;
      }
    }

    if (params.viewMode !== undefined) viewMode = params.viewMode as ViewMode;
    if (params.groupingColumnId !== undefined) groupingColumnId = params.groupingColumnId ?? undefined;

    if (!hasUrlQueryState) {
      filters = filters ?? this.defaultParams?.filters;
      searchTerm = searchTerm ?? this.defaultParams?.searchTerm;
      sortDescriptor = sortDescriptor ?? this.defaultParams?.sortDescriptor;
      pagination = pagination ?? this.defaultParams?.pagination;
    }

    const [filterableFields, customColumns] = await Promise.all([
      this.repo.getFilterableFields(),
      this.repo.getCustomColumns(),
    ]);
    const sortableFields = this.repo.getSortableFields();

    filters = this.repo.validateFilters(filters, filterableFields);
    sortDescriptor = this.repo.validateSortDescriptor(sortDescriptor, sortableFields, customColumns);

    if (p13nId && !IS_DEMO_MODE) {
      await this.p13nRepo.upsertP13n({
        p13nId,
        filters: filters ?? null,
        searchTerm: searchTerm ?? null,
        sortDescriptor: sortDescriptor ?? null,
        pagination: pagination ?? null,
      });
    }

    const baseQuery: BaseQuery = { filters, searchTerm, sortDescriptor };
    const groupingColumn = pickGroupingColumn(params.groupedPagination, viewMode, groupingColumnId, customColumns);

    const { items, total, groupCounts } = groupingColumn
      ? await this.fetchGrouped(
          baseQuery,
          params.groupedPagination ?? defaultGroupedPagination(groupingColumn),
          groupingColumn,
        )
      : await this.fetchFlat(baseQuery, pagination);

    return {
      ok: true,
      data: {
        p13nId,
        items,
        filters,
        searchTerm,
        sortDescriptor,
        customColumns,
        filterableFields,
        columnOrder,
        columnWidths,
        hiddenColumns,
        savedFilterPresets,
        viewMode,
        groupingColumnId,
        groupCounts,
        pagination: buildPaginationResponse(pagination, total),
      },
    };
  }

  private async fetchFlat(baseQuery: BaseQuery, pagination: PaginationRequest | undefined): Promise<FetchResult<T>> {
    const [items, total] = await Promise.all([
      this.repo.getItems({ ...baseQuery, pagination }),
      this.repo.getCount({ filters: baseQuery.filters, searchTerm: baseQuery.searchTerm }),
    ]);
    return { items, total };
  }

  private async fetchGrouped(
    baseQuery: BaseQuery,
    groupedPagination: GroupedPaginationRequest,
    groupingColumn: SingleSelectColumn,
  ): Promise<FetchResult<T>> {
    const groupKeys = [...groupingColumn.options.options.map((o) => o.value), KANBAN_EMPTY_GROUP_KEY];

    const takeFor = (groupKey: string) =>
      groupedPagination.overrides?.[groupKey] ?? groupedPagination.perGroup ?? KANBAN_PER_GROUP_DEFAULT;

    const results = await Promise.all(
      groupKeys.map(async (groupKey) => {
        const filters = [...(baseQuery.filters ?? []), buildGroupFilter(groupingColumn.id, groupKey)];
        const [items, count] = await Promise.all([
          this.repo.getItems({ ...baseQuery, filters, take: takeFor(groupKey), skip: 0 }),
          this.repo.getCount({ filters, searchTerm: baseQuery.searchTerm }),
        ]);
        return { groupKey, items, count };
      }),
    );

    const items = results.flatMap((r) => r.items);
    const groupCounts = Object.fromEntries(results.map((r) => [r.groupKey, r.count]));
    const total = results.reduce((sum, r) => sum + r.count, 0);

    return { items, total, groupCounts };
  }
}

function pickGroupingColumn(
  groupedPagination: GroupedPaginationRequest | undefined,
  viewMode: ViewMode | undefined,
  groupingColumnId: string | undefined,
  customColumns: CustomColumnDto[],
): SingleSelectColumn | undefined {
  const targetColumnId =
    groupedPagination?.groupingColumnId ?? (viewMode === ViewMode.card ? groupingColumnId : undefined);
  if (!targetColumnId) return undefined;

  const column = customColumns.find((c) => c.id === targetColumnId);
  return column?.type === CustomColumnType.singleSelect ? column : undefined;
}

function defaultGroupedPagination(column: SingleSelectColumn): GroupedPaginationRequest {
  return { groupingColumnId: column.id, perGroup: KANBAN_PER_GROUP_DEFAULT };
}

function buildGroupFilter(groupingColumnId: string, groupKey: string): Filter {
  if (groupKey === KANBAN_EMPTY_GROUP_KEY) return { field: groupingColumnId, operator: FilterOperatorKey.isNull };
  return { field: groupingColumnId, operator: FilterOperatorKey.in, value: [groupKey] };
}

function buildPaginationResponse(pagination: PaginationRequest | undefined, total: number): PaginationResponse {
  const pageSize = pagination?.pageSize || 100;
  const page = pagination?.page || 1;
  return { page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)), total } as PaginationResponse;
}
