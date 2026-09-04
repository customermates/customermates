import type { Validated } from "../validation/validation.utils";
import type { SortableField, SearchableField } from "./base-query-builder";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { DataViewStateRepo } from "@/core/data-view/data-view-state.repo";
import type { DataViewChipDto, DataViewState } from "@/core/data-view/data-view-state.schema";
import type {
  DataViewDefaultsLayer,
  DataViewParamsLayer,
  ResolvedDataViewState,
} from "@/core/data-view/resolve-data-view-state";
import type {
  FilterableField,
  Filter,
  GetQueryParams,
  GroupValueSums,
  GroupedPaginationRequest,
  PaginationRequest,
  PaginationResponse,
  SavedFilterPreset,
  SortDescriptor,
} from "./base-get.schema";

import { CustomColumnType } from "@/generated/prisma";

import type { EntityType } from "@/generated/prisma";
import type { NumericFieldSums, SummableModel } from "./base-repository";
import type { QueryParamsPrecheckInteractor } from "./query-params-precheck.interactor";

import { env } from "@/env";
import { KANBAN_EMPTY_GROUP_KEY, KANBAN_PER_GROUP_DEFAULT } from "./base-get.schema";
import { FilterOperatorKey, ViewMode } from "./base-query-builder";
import { ALL_VIEW_KEY, isShareableSurface } from "@/core/data-view/data-view-keys";
import { resolveDataViewState } from "@/core/data-view/resolve-data-view-state";
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
  valueSums?: GroupValueSums;
  views?: DataViewChipDto[];
  activeViewKey?: string;
  viewIsDirty?: boolean;
  viewIsOwner?: boolean;
  viewCanShare?: boolean;
  viewPersistable?: boolean;
  viewUnavailable?: boolean;
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
  abstract sumNumericFields<F extends string>(opts: {
    model: SummableModel;
    fields: readonly F[];
    params: GetQueryParams;
  }): Promise<NumericFieldSums<F>>;
}

type BaseQuery = { filters?: Filter[]; searchTerm?: string; sortDescriptor?: SortDescriptor };

type SingleSelectColumn = Extract<CustomColumnDto, { type: typeof CustomColumnType.singleSelect }>;

type FetchResult<T> = {
  items: T[];
  total: number;
  groupCounts?: Record<string, number>;
  groupValueSums?: Record<string, GroupValueSums>;
  valueSums?: GroupValueSums;
};

type ViewContext = {
  activeViewKey: string;
  views: DataViewChipDto[];
  view: DataViewChipDto | undefined;
  override: DataViewState | undefined;
  isOwner: boolean;
  unavailable: boolean;
};

export abstract class BaseGetInteractor<T> {
  constructor(
    protected repo: BaseGetRepo<T>,
    protected viewStateRepo: DataViewStateRepo,
    protected mode: "interactive" | "api",
    protected entityType: EntityType | undefined,
    protected defaultParams?: GetQueryParams,
    protected queryParamsPrecheck?: QueryParamsPrecheckInteractor,
    protected queryParamsPrecheckFilterableFields?: FilterableField[],
    protected groupValueSumFields: readonly string[] = [],
  ) {}

  async invoke(params: GetQueryParams = {}): Validated<GetResult<T>> {
    const surfaceKey = params.p13nId;
    const interactive = this.mode === "interactive" && surfaceKey !== undefined;

    const context = interactive ? await this.loadViewContext(surfaceKey, params.viewId) : emptyViewContext();

    const resolved = resolveDataViewState({
      params: toParamsLayer(params),
      override: context.override,
      view: context.view?.state,
      defaults: interactive ? this.defaultState : defaultsForUnsurfacedRequest(params, this.defaultState),
    });

    const page = params.page ?? params.pagination?.page ?? 1;
    const pageSize = resolved.pageSize;
    const pagination: PaginationRequest = { page, pageSize };

    const [filterableFields, customColumns] = await Promise.all([
      this.repo.getFilterableFields(),
      this.repo.getCustomColumns(),
    ]);
    const sortableFields = this.repo.getSortableFields();

    if (this.mode === "api") {
      const precheck = this.queryParamsPrecheck;
      if (!precheck) throw new Error("api mode requires a queryParamsPrecheck");

      const checked = await runPrecheck(
        { filters: resolved.filters, sortDescriptor: resolved.sortDescriptor },
        (data, ctx) =>
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

    const filters = this.repo.validateFilters({ filters: resolved.filters, filterableFields });
    const sortDescriptor = this.repo.validateSortDescriptor({
      sortDescriptor: resolved.sortDescriptor,
      sortableFields,
      customColumns,
    });

    const baseQuery: BaseQuery = { filters, searchTerm: resolved.searchTerm, sortDescriptor };
    const groupingColumn = pickGroupingColumn(
      params.groupedPagination,
      resolved.viewMode,
      resolved.groupingColumnId,
      customColumns,
    );

    const { items, total, groupCounts, groupValueSums } = groupingColumn
      ? await this.fetchGrouped(
          baseQuery,
          params.groupedPagination ?? { groupingColumnId: groupingColumn.id, perGroup: KANBAN_PER_GROUP_DEFAULT },
          groupingColumn,
        )
      : await this.fetchFlat(baseQuery, pagination);

    const valueSums = await this.sumDeclaredFields(baseQuery);

    return {
      ok: true,
      data: {
        p13nId: surfaceKey,
        items,
        filters,
        searchTerm: resolved.searchTerm,
        sortDescriptor,
        customColumns,
        filterableFields,
        groupCounts,
        groupValueSums,
        valueSums,
        pagination: {
          page,
          pageSize,
          totalPages: Math.max(1, Math.ceil(total / pageSize)),
          total,
        } as PaginationResponse,
        ...(interactive ? viewResult(surfaceKey, resolved, context) : {}),
      },
    };
  }

  private get defaultState(): DataViewDefaultsLayer {
    return {
      filters: this.defaultParams?.filters,
      searchTerm: this.defaultParams?.searchTerm,
      sortDescriptor: this.defaultParams?.sortDescriptor,
      pageSize: this.defaultParams?.pagination?.pageSize,
    };
  }

  private async loadViewContext(surfaceKey: string, requestedViewId: string | undefined): Promise<ViewContext> {
    const surface = await this.viewStateRepo.loadSurfaceState(surfaceKey);
    const readable = new Map(surface.views.map((chip) => [chip.id, chip]));
    const selection = selectActiveViewKey(requestedViewId, surface.activeViewKey, readable);
    const view = selection.key === ALL_VIEW_KEY ? undefined : readable.get(selection.key);

    return {
      activeViewKey: selection.key,
      views: surface.views,
      view,
      override: surface.overrides.get(selection.key),
      isOwner: view?.isOwner ?? false,
      unavailable: selection.unavailable,
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
          this.sumDeclaredFields({ filters, searchTerm: baseQuery.searchTerm }),
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

  private async sumDeclaredFields(params: GetQueryParams): Promise<GroupValueSums | undefined> {
    if (this.groupValueSumFields.length === 0 || !this.entityType) return undefined;

    const sums = await this.repo.sumNumericFields({
      model: this.entityType as SummableModel,
      fields: this.groupValueSumFields,
      params,
    });

    return Object.fromEntries(
      this.groupValueSumFields.flatMap((field) => (typeof sums[field] === "number" ? [[field, sums[field]]] : [])),
    );
  }
}

function emptyViewContext(): ViewContext {
  return {
    activeViewKey: ALL_VIEW_KEY,
    views: [],
    view: undefined,
    override: undefined,
    isOwner: false,
    unavailable: false,
  };
}

const OWN_QUERY_STATE_KEYS = ["filters", "searchTerm", "sortDescriptor", "pagination"] as const;

function carriesOwnQueryState(params: GetQueryParams): boolean {
  return OWN_QUERY_STATE_KEYS.some((key) => params[key] !== undefined);
}

function defaultsForUnsurfacedRequest(
  params: GetQueryParams,
  surfaceDefaults: DataViewDefaultsLayer,
): DataViewDefaultsLayer {
  return carriesOwnQueryState(params) ? {} : surfaceDefaults;
}

function toParamsLayer(params: GetQueryParams): DataViewParamsLayer {
  return {
    filters: params.filters,
    searchTerm: params.searchTerm,
    sortDescriptor: params.sortDescriptor,
    pageSize: params.pageSize ?? params.pagination?.pageSize,
    viewMode: params.viewMode,
    groupingColumnId: params.groupingColumnId,
  };
}

function selectActiveViewKey(
  requestedViewId: string | undefined,
  rememberedViewKey: string | null,
  readable: Map<string, DataViewChipDto>,
): { key: string; unavailable: boolean } {
  if (requestedViewId === ALL_VIEW_KEY) return { key: ALL_VIEW_KEY, unavailable: false };

  if (requestedViewId !== undefined) {
    return readable.has(requestedViewId)
      ? { key: requestedViewId, unavailable: false }
      : { key: ALL_VIEW_KEY, unavailable: true };
  }

  const remembered = rememberedViewKey ?? ALL_VIEW_KEY;
  const isResolvable = remembered === ALL_VIEW_KEY || readable.has(remembered);

  return { key: isResolvable ? remembered : ALL_VIEW_KEY, unavailable: false };
}

function viewResult(surfaceKey: string | undefined, resolved: ResolvedDataViewState, context: ViewContext) {
  return {
    columnOrder: resolved.columnOrder,
    columnWidths: resolved.columnWidths,
    hiddenColumns: resolved.hiddenColumns,
    viewMode: resolved.viewMode,
    groupingColumnId: resolved.groupingColumnId,
    views: context.views,
    activeViewKey: context.activeViewKey,
    viewIsDirty: context.override !== undefined,
    viewIsOwner: context.isOwner,
    viewCanShare: isShareableSurface(surfaceKey) && context.isOwner,
    viewPersistable: env.APP_MODE !== "demo",
    viewUnavailable: context.unavailable,
    savedFilterPresets: context.views.map(({ id, name, state }) => ({ id, name, filters: state.filters ?? [] })),
  };
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
