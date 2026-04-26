import type { Validated } from "../validation/validation.utils";
import type { SortableField, SearchableField, ViewMode } from "./base-query-builder";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { P13nEntry, SavedFilterPreset } from "@/features/p13n/prisma-p13n.repository";
import type { UpsertP13nData } from "@/features/p13n/upsert-p13n.interactor";
import type { FilterableField, Filter, GetQueryParams, SortDescriptor, PaginationResponse } from "./base-get.schema";

import { IS_DEMO_MODE } from "@/constants/env";

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

    let columnOrder: string[] | undefined = undefined;
    let columnWidths: Record<string, number> | undefined = undefined;
    let hiddenColumns: string[] | undefined = undefined;
    let viewMode: ViewMode | undefined = undefined;
    let groupingColumnId: string | undefined = undefined;

    let savedFilterPresets: SavedFilterPreset[] | undefined = undefined;

    if (p13nId) {
      const p13nData = await this.p13nRepo.getP13n(p13nId);

      if (p13nData) {
        filters = filters ?? p13nData.filters;
        searchTerm = searchTerm ?? p13nData.searchTerm;
        sortDescriptor = sortDescriptor ?? p13nData.sortDescriptor;
        pagination = pagination ?? p13nData.pagination;

        columnOrder = p13nData.columnOrder;
        columnWidths = p13nData.columnWidths;
        hiddenColumns = p13nData.hiddenColumns;
        savedFilterPresets = p13nData.savedFilterPresets;
        viewMode = p13nData.viewMode;
        groupingColumnId = p13nData.groupingColumnId;
      }
    }

    filters = filters ?? this.defaultParams?.filters;
    searchTerm = searchTerm ?? this.defaultParams?.searchTerm;
    sortDescriptor = sortDescriptor ?? this.defaultParams?.sortDescriptor;
    pagination = pagination ?? this.defaultParams?.pagination;

    const [filterableFields, customColumns] = await Promise.all([
      this.repo.getFilterableFields(),
      this.repo.getCustomColumns(),
    ]);
    const sortableFields = this.repo.getSortableFields();

    filters = this.repo.validateFilters(filters, filterableFields);
    sortDescriptor = this.repo.validateSortDescriptor(sortDescriptor, sortableFields, customColumns);

    if (p13nId && !IS_DEMO_MODE) {
      await this.p13nRepo.upsertP13n({
        p13nId: p13nId ?? null,
        filters: filters ?? null,
        searchTerm: searchTerm ?? null,
        sortDescriptor: sortDescriptor ?? null,
        pagination: pagination ?? null,
      });
    }

    const baseParams = { filters, searchTerm, sortDescriptor };

    const items = await this.repo.getItems({ ...baseParams, pagination });
    const total = await this.repo.getCount({ filters, searchTerm });
    const pageSize = pagination?.pageSize || 100;
    const page = pagination?.page || 1;

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
        pagination: {
          page,
          pageSize,
          totalPages: Math.ceil(total / pageSize),
          total,
        },
      },
    };
  }
}
