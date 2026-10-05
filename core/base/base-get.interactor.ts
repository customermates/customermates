import type { GroupAxis, GroupCountRow, ResolvedGrouping } from "@/core/base/grouping/group-axis";
import type { DataViewGroup, GroupPageRequest, Grouping, GroupingResult } from "@/core/base/grouping/grouping.schema";
import type { CustomColumnDto } from "@/core/data-view/column-presentation.schema";
import type { DataViewStateRepo } from "@/core/data-view/data-view-state.repo";
import type { DataViewChipDto, DataViewState } from "@/core/data-view/data-view-state.schema";
import type {
  DataViewDefaultsLayer,
  DataViewParamsLayer,
  ResolvedDataViewState,
} from "@/core/data-view/resolve-data-view-state";
import type { Validated } from "../validation/validation.utils";
import type {
  Filter,
  FilterableField,
  GetQueryParams,
  GroupValueSums,
  PaginationRequest,
  PaginationResponse,
  SortDescriptor,
} from "./base-get.schema";
import type { BaseGetRepo } from "./base-get.repo";

import type { GroupableFieldDto, GroupableFieldSpec } from "@/core/base/grouping/groupable-field";
import type { QueryParamsPrecheckInteractor } from "./query-params-precheck.interactor";

import { resolveGroupAxis, resolveGrouping } from "@/core/base/grouping/group-axis";
import { groupableFieldDtos } from "@/core/base/grouping/groupable-field";
import {
  GROUP_PAGE_SIZE_DEFAULT,
  MAX_MATERIALISED_GROUPS,
  NO_VALUE_GROUP_KEY,
} from "@/core/base/grouping/grouping.schema";
import { ALL_VIEW_KEY } from "@/core/data-view/data-view-keys";
import { resolveDataViewState } from "@/core/data-view/resolve-data-view-state";
import { env } from "@/env";
import { runPrecheck } from "../validation/run-precheck";
import { acceptSingleValueEquals } from "./filter-compat";
import type { ViewMode } from "./base-query-builder";

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
  viewMode?: ViewMode;
  grouping?: GroupingResult;
  groupableFields?: GroupableFieldDto[];
  groupCounts?: Record<string, number>;
  groupValueSums?: Record<string, GroupValueSums>;
  valueSums?: GroupValueSums;
  views?: DataViewChipDto[];
  activeViewKey?: string;
  allState?: DataViewState;
  viewPersistable?: boolean;
}

type BaseQuery = {
  filters?: Filter[];
  searchTerm?: string;
  sortDescriptor?: SortDescriptor;
};

type GroupPage<T> = {
  key: string;
  items: T[];
  hasMore: boolean;
};

type HasId = { id: string };

type FetchResult<T> = {
  items: T[];
  total: number;
  grouping?: GroupingResult;
  groupCounts?: Record<string, number>;
};

type ViewContext = {
  activeViewKey: string;
  views: DataViewChipDto[];
  view: DataViewChipDto | undefined;
  base: DataViewState | undefined;
  allState: DataViewState;
};

export abstract class BaseGetInteractor<T> {
  constructor(
    protected repo: BaseGetRepo<T>,
    protected viewStateRepo: DataViewStateRepo,
    protected mode: "interactive" | "api",
    protected defaultParams?: GetQueryParams,
    protected queryParamsPrecheck?: QueryParamsPrecheckInteractor,
    protected queryParamsPrecheckFilterableFields?: FilterableField[],
  ) {}

  async invoke(params: GetQueryParams = {}): Validated<GetResult<T>> {
    const surfaceKey = params.p13nId;
    const interactive = this.mode === "interactive" && surfaceKey !== undefined;

    const context = interactive ? await this.loadViewContext(surfaceKey, params.viewId) : emptyViewContext();

    const defaults = interactive ? this.defaultState : defaultsForUnsurfacedRequest(params, this.defaultState);
    const resolved = resolveDataViewState({
      params: toParamsLayer(params),
      base: context.base,
      defaults,
    });

    const page = params.page ?? params.pagination?.page ?? 1;
    const pageSize = resolved.pageSize;
    const pagination: PaginationRequest = { page, pageSize };

    const [filterableFields, customColumns] = await Promise.all([
      this.repo.filterableFieldsOnce(),
      this.repo.customColumnsOnce(),
    ]);
    const sortableFields = this.repo.getSortableFields();
    const requestedFilters = acceptSingleValueEquals(
      resolved.filters,
      this.queryParamsPrecheckFilterableFields ?? filterableFields,
    );

    if (this.mode === "api") {
      const precheck = this.queryParamsPrecheck;
      if (!precheck) throw new Error("api mode requires a queryParamsPrecheck");

      const checked = await runPrecheck(
        { filters: requestedFilters, sortDescriptor: resolved.sortDescriptor },
        (data, ctx) =>
          precheck.invoke(
            {
              filterableFields: this.queryParamsPrecheckFilterableFields ?? filterableFields,
              customColumns,
              sortableFields,
            },
            data,
            ctx,
          ),
      );
      if (!checked.ok) return { ok: false as const, error: checked.error };
    }

    const filters = this.repo.validateFilters({
      filters: requestedFilters,
      filterableFields,
    });
    const validSort = (candidate: SortDescriptor | null | undefined) =>
      this.repo.validateSortDescriptor({
        sortDescriptor: candidate ?? undefined,
        sortableFields,
        customColumns,
      });
    const sortDescriptor =
      validSort(resolved.sortDescriptor) ??
      validSort(context.base?.sortDescriptor) ??
      validSort(defaults.sortDescriptor);

    const baseQuery: BaseQuery = {
      filters,
      searchTerm: resolved.searchTerm,
      sortDescriptor,
    };
    const requested = normaliseGroupingRequest(params, resolved);
    const groupableSpecs = await this.repo.getGroupableFields(customColumns);
    const resolvedGrouping = resolveGrouping(requested.grouping, groupableSpecs);

    const { items, total, grouping, groupCounts } = resolvedGrouping
      ? await this.fetchGrouped(baseQuery, resolvedGrouping, requested.page)
      : await this.fetchFlat(baseQuery, pagination);

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
        ...(grouping ? { grouping } : {}),
        ...(groupableSpecs.length > 0 ? { groupableFields: groupableFieldDtos(groupableSpecs) } : {}),
        groupCounts,
        pagination: {
          page,
          pageSize,
          totalPages: Math.max(1, Math.ceil(total / pageSize)),
          total,
        } as PaginationResponse,
        ...(interactive ? viewResult(resolved, context) : {}),
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
    const activeViewKey = selectActiveViewKey(requestedViewId, surface.activeViewKey, readable);
    const view = activeViewKey === ALL_VIEW_KEY ? undefined : readable.get(activeViewKey);

    return {
      activeViewKey,
      views: surface.views,
      view,
      base: view ? view.state : surface.allState,
      allState: surface.allState,
    };
  }

  private async fetchFlat(baseQuery: BaseQuery, pagination: PaginationRequest | undefined): Promise<FetchResult<T>> {
    const [items, total] = await Promise.all([
      this.repo.getItems({ ...baseQuery, pagination }),
      this.repo.getCount({
        filters: baseQuery.filters,
        searchTerm: baseQuery.searchTerm,
      }),
    ]);
    return { items, total };
  }

  private async fetchGrouped(
    baseQuery: BaseQuery,
    resolved: ResolvedGrouping,
    page: GroupPageRequest,
  ): Promise<FetchResult<T>> {
    const { spec, grouping } = resolved;
    const now = new Date().toISOString();

    if (page.only !== undefined) return this.fetchOneGroup(baseQuery, resolved, page, now);
    if (!this.repo.countByGroup) throw new Error("This repository declares groupable fields but cannot count groups");

    const [rows, total] = await Promise.all([
      this.repo.countByGroup({ spec, params: baseQuery, bucket: grouping.bucket, now }),
      this.repo.getCount({
        filters: baseQuery.filters,
        searchTerm: baseQuery.searchTerm,
      }),
    ]);

    const labels =
      (await this.repo.resolveGroupLabels?.(
        spec,
        rows.map((row) => row.key),
      )) ?? new Map();
    const axis = resolveGroupAxis({
      spec,
      bucket: grouping.bucket,
      now,
      rows,
      labels,
      collator: this.repo.collator(),
    });

    const collapsed = new Set(page.collapsed ?? []);
    const materialised = axis.groups
      .filter((group) => !collapsed.has(group.key) && group.count > 0)
      .slice(0, MAX_MATERIALISED_GROUPS);

    const pages = await Promise.all(
      materialised.map(async (group): Promise<GroupPage<T>> => {
        const groupScope = {
          spec,
          key: group.key,
          bucket: grouping.bucket,
          now,
        };
        const take = page.overrides?.[group.key] ?? page.perGroup ?? GROUP_PAGE_SIZE_DEFAULT;

        const items = await this.repo.getItems({
          ...baseQuery,
          groupScope,
          take: take + 1,
          skip: 0,
        });

        return {
          key: group.key,
          items: items.slice(0, take),
          hasMore: items.length > take,
        };
      }),
    );

    return assembleGroupedResult({ spec, grouping, axis, pages, rows, total });
  }

  private async fetchOneGroup(
    baseQuery: BaseQuery,
    resolved: ResolvedGrouping,
    page: GroupPageRequest,
    now: string,
  ): Promise<FetchResult<T>> {
    const { spec, grouping } = resolved;
    const key = page.only as string;
    const take = page.overrides?.[key] ?? page.perGroup ?? GROUP_PAGE_SIZE_DEFAULT;

    const fetched = await this.repo.getItems({
      ...baseQuery,
      groupScope: { spec, key, bucket: grouping.bucket, now },
      take: take + 1,
      skip: 0,
    });
    const items = fetched.slice(0, take);

    return {
      items,
      total: 0,
      grouping: {
        grouping,
        kind: spec.kind,
        supportsDragWriteBack: false,
        partial: true,
        total: 0,
        groups: [
          {
            key,
            count: 0,
            labelKind: key === NO_VALUE_GROUP_KEY ? "noValue" : "value",
            isNoValue: key === NO_VALUE_GROUP_KEY,
            materialised: true,
            itemIds: itemIds(items),
            hasMore: fetched.length > take,
          },
        ],
      },
    };
  }
}

function emptyViewContext(): ViewContext {
  return {
    activeViewKey: ALL_VIEW_KEY,
    views: [],
    view: undefined,
    base: undefined,
    allState: {},
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
    grouping: params.grouping,
  };
}

function selectActiveViewKey(
  requestedViewId: string | undefined,
  rememberedViewKey: string | null,
  readable: Map<string, DataViewChipDto>,
): string {
  if (requestedViewId !== undefined) return readable.has(requestedViewId) ? requestedViewId : ALL_VIEW_KEY;

  const remembered = rememberedViewKey ?? ALL_VIEW_KEY;

  return readable.has(remembered) ? remembered : ALL_VIEW_KEY;
}

function viewResult(resolved: ResolvedDataViewState, context: ViewContext) {
  return {
    columnOrder: resolved.columnOrder,
    columnWidths: resolved.columnWidths,
    hiddenColumns: resolved.hiddenColumns,
    viewMode: resolved.viewMode,
    views: context.views,
    activeViewKey: context.activeViewKey,
    allState: context.allState,
    viewPersistable: env.APP_MODE !== "demo",
  };
}

function normaliseGroupingRequest(
  params: GetQueryParams,
  resolved: ResolvedDataViewState,
): { grouping: Grouping | undefined; page: GroupPageRequest } {
  const legacy = params.groupedPagination;
  const page: GroupPageRequest =
    params.groupPage ?? (legacy ? { perGroup: legacy.perGroup, overrides: legacy.overrides } : {});

  if (legacy) return { grouping: { field: legacy.groupingColumnId }, page };

  return { grouping: resolved.grouping, page };
}

function itemIds<T>(items: T[]): string[] {
  return items.map((item) => (item as HasId).id);
}

function assembleGroupedResult<T>(input: {
  spec: GroupableFieldSpec;
  grouping: Grouping;
  axis: GroupAxis;
  pages: GroupPage<T>[];
  rows: readonly GroupCountRow[];
  total: number;
}): FetchResult<T> {
  const pageByKey = new Map(input.pages.map((page) => [page.key, page]));

  const groups: DataViewGroup[] = input.axis.groups.map((group) => {
    const page = pageByKey.get(group.key);
    if (!page) return group.count > 0 ? { ...group, hasMore: true } : group;

    return {
      ...group,
      materialised: true,
      itemIds: itemIds(page.items),
      hasMore: page.hasMore,
    };
  });

  const seen = new Set<string>();
  const items = input.pages.flatMap((page) =>
    page.items.filter((item) => {
      const id = (item as HasId).id;
      if (seen.has(id)) return false;
      seen.add(id);

      return true;
    }),
  );

  const membershipTotal = input.rows.reduce((sum, row) => sum + row.count, 0);

  return {
    items,
    total: input.total,
    grouping: {
      grouping: input.grouping,
      kind: input.spec.kind,
      supportsDragWriteBack: false,
      groups,
      total: input.total,
      ...(input.spec.kind === "relation" ? { membershipTotal } : {}),
      ...(input.axis.overflow ? { overflow: input.axis.overflow } : {}),
    },
    groupCounts: Object.fromEntries(groups.map((group) => [group.key, group.count])),
  };
}
