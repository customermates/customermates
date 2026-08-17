import type { Validated } from "../validation/validation.utils";
import type { SortableField, SearchableField } from "./base-query-builder";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { P13nEntry, SavedFilterPreset } from "@/features/p13n/prisma-p13n.repository";
import type { UpsertP13nData } from "@/features/p13n/upsert-p13n.interactor";
import type {
  FilterableField,
  Filter,
  GetQueryParams,
  GroupValueSums,
  GroupedPaginationRequest,
  PaginationRequest,
  PaginationResponse,
  SortDescriptor,
} from "./base-get.schema";

import { CustomColumnType, EntityType } from "@/generated/prisma";

import type { NumericFieldSums, SummableModel } from "./base-repository";
import type { QueryParamsPrecheckInteractor } from "./query-params-precheck.interactor";

import { env } from "@/env";
import { GROUP_VALUE_SUM_FIELDS, KANBAN_EMPTY_GROUP_KEY, KANBAN_PER_GROUP_DEFAULT } from "./base-get.schema";
import { FilterOperatorKey, ViewMode } from "./base-query-builder";
import { runPrecheck } from "../validation/run-precheck";

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
  groupValueSums?: Record<string, GroupValueSums>;
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
  abstract validateFilters(args: { filters: Filter[] | undefined; filterableFields: FilterableField[] }): Filter[];
  abstract validateSortDescriptor(args: {
    sortDescriptor: SortDescriptor | undefined;
    sortableFields: SortableField[];
    customColumns?: CustomColumnDto[];
  }): SortDescriptor | undefined;
}

type NumericFieldSumsRepo = {
  sumNumericFields<F extends string>(opts: {
    model: SummableModel;
    fields: readonly F[];
    params: GetQueryParams;
  }): Promise<NumericFieldSums<F>>;
};

function supportsNumericFieldSums(repo: unknown): repo is NumericFieldSumsRepo {
  return typeof (repo as Partial<NumericFieldSumsRepo>).sumNumericFields === "function";
}

type BaseQuery = { filters?: Filter[]; searchTerm?: string; sortDescriptor?: SortDescriptor };

type SingleSelectColumn = Extract<CustomColumnDto, { type: typeof CustomColumnType.singleSelect }>;

type FetchResult<T> = {
  items: T[];
  total: number;
  groupCounts?: Record<string, number>;
  groupValueSums?: Record<string, GroupValueSums>;
};

export abstract class BaseGetInteractor<T> {
  constructor(
    protected repo: BaseGetRepo<T>,
    protected p13nRepo: P13nRepo,
    protected mode: "interactive" | "api",
    protected entityType: EntityType | undefined,
    protected defaultParams?: GetQueryParams,
    protected queryParamsPrecheck?: QueryParamsPrecheckInteractor,
    protected queryParamsPrecheckFilterableFields?: FilterableField[],
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

    if (p13nId && this.mode === "interactive") {
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

    if (this.mode === "api") {
      const precheck = this.queryParamsPrecheck;
      if (!precheck) throw new Error("api mode requires a queryParamsPrecheck");

      const checked = await runPrecheck({ filters, sortDescriptor }, (data, ctx) =>
        precheck.invoke(
          {
            filterableFields: this.queryParamsPrecheckFilterableFields ?? filterableFields,
            customColumns,
            sortableFields,
          },
          this.entityType,
          data,
          ctx,
        ),
      );
      if (!checked.ok) return { ok: false as const, error: checked.error };
    }

    const keptFilters = this.repo.validateFilters({ filters, filterableFields });
    filters = keptFilters;
    sortDescriptor = this.repo.validateSortDescriptor({ sortDescriptor, sortableFields, customColumns });

    if (p13nId && this.mode === "interactive" && env.APP_MODE !== "demo") {
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

    const { items, total, groupCounts, groupValueSums } = groupingColumn
      ? await this.fetchGrouped(
          baseQuery,
          params.groupedPagination ?? { groupingColumnId: groupingColumn.id, perGroup: KANBAN_PER_GROUP_DEFAULT },
          groupingColumn,
        )
      : await this.fetchFlat(baseQuery, pagination);

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
        groupCounts,
        groupValueSums,
        pagination: {
          page,
          pageSize,
          totalPages: Math.max(1, Math.ceil(total / pageSize)),
          total,
        } as PaginationResponse,
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
        const groupFilter: Filter =
          groupKey === KANBAN_EMPTY_GROUP_KEY
            ? { field: groupingColumn.id, operator: FilterOperatorKey.isNull }
            : { field: groupingColumn.id, operator: FilterOperatorKey.in, value: [groupKey] };
        const filters = [...(baseQuery.filters ?? []), groupFilter];
        const [items, count, valueSums] = await Promise.all([
          this.repo.getItems({ ...baseQuery, filters, take: takeFor(groupKey), skip: 0 }),
          this.repo.getCount({ filters, searchTerm: baseQuery.searchTerm }),
          this.fetchGroupValueSums({ filters, searchTerm: baseQuery.searchTerm }),
        ]);
        return { groupKey, items, count, valueSums };
      }),
    );

    const items = results.flatMap((r) => r.items);
    const groupCounts = Object.fromEntries(results.map((r) => [r.groupKey, r.count]));
    const summedGroups = results.flatMap((r) => (r.valueSums ? [[r.groupKey, r.valueSums] as const] : []));
    const groupValueSums = summedGroups.length > 0 ? Object.fromEntries(summedGroups) : undefined;
    const total = results.reduce((sum, r) => sum + r.count, 0);

    return { items, total, groupCounts, groupValueSums };
  }

  private async fetchGroupValueSums(params: GetQueryParams): Promise<GroupValueSums | undefined> {
    const repo = this.repo;
    if (this.entityType !== EntityType.deal || !supportsNumericFieldSums(repo)) return undefined;

    const sums = await repo.sumNumericFields({
      model: EntityType.deal,
      fields: [GROUP_VALUE_SUM_FIELDS.total, GROUP_VALUE_SUM_FIELDS.weighted],
      params,
    });

    const total = sums[GROUP_VALUE_SUM_FIELDS.total] ?? 0;
    const weighted = sums[GROUP_VALUE_SUM_FIELDS.weighted];

    return weighted == null ? { total } : { total, weighted };
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
