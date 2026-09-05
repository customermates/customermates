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
  PaginationRequest,
  PaginationResponse,
  SortDescriptor,
} from "./base-get.schema";
import type {
  DataViewGroup,
  DateBucket,
  GroupPageRequest,
  Grouping,
  GroupingResult,
} from "@/core/base/grouping/grouping.schema";
import type { GroupCountRow } from "@/core/base/grouping/group-count";
import type { GroupAxis, ResolvedGrouping } from "@/core/base/grouping/group-axis";
import type { GroupLabel } from "@/core/base/grouping/group-labels";

import type { EntityType } from "@/generated/prisma";
import type { GroupableFieldDto, GroupableFieldSpec } from "@/core/base/grouping/groupable-field";
import type { NumericFieldSums, SummableModel } from "./base-repository";
import type { QueryParamsPrecheckInteractor } from "./query-params-precheck.interactor";

import { env } from "@/env";
import {
  GROUP_PAGE_SIZE_DEFAULT,
  MAX_MATERIALISED_GROUPS,
  NO_VALUE_GROUP_KEY,
} from "@/core/base/grouping/grouping.schema";
import { groupableFieldDtos } from "@/core/base/grouping/groupable-field";
import { resolveGroupAxis, resolveGrouping } from "@/core/base/grouping/group-axis";
import type { ViewMode } from "./base-query-builder";
import { ALL_VIEW_KEY } from "@/core/data-view/data-view-keys";
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
  viewMode?: ViewMode;
  grouping?: GroupingResult;
  groupableFields?: GroupableFieldDto[];
  groupCounts?: Record<string, number>;
  groupValueSums?: Record<string, GroupValueSums>;
  valueSums?: GroupValueSums;
  views?: DataViewChipDto[];
  activeViewKey?: string;
  viewPersistable?: boolean;
}

export abstract class BaseGetRepo<T> {
  abstract getItems(params: GetQueryParams): Promise<T[]>;
  abstract getCount(params: GetQueryParams): Promise<number>;
  abstract getSortableFields(): SortableField[];
  abstract getSearchableFields(): SearchableField[];
  abstract getFilterableFields(): Promise<FilterableField[]>;
  abstract getCustomColumns(): Promise<CustomColumnDto[]>;
  getGroupableFields(_customColumns?: readonly CustomColumnDto[]): Promise<GroupableFieldSpec[]> {
    return Promise.resolve([]);
  }
  countByGroup(_args: {
    spec: GroupableFieldSpec;
    params: GetQueryParams;
    bucket?: DateBucket;
    sumFields?: readonly string[];
    now?: string;
  }): Promise<GroupCountRow[]> {
    throw new Error("countByGroup is not implemented on this repository");
  }
  resolveGroupLabels(_spec: GroupableFieldSpec, _keys: readonly string[]): Promise<Map<string, GroupLabel>> {
    return Promise.resolve(new Map());
  }
  collator(): Pick<Intl.Collator, "compare"> {
    return { compare: (left, right) => (left < right ? -1 : left > right ? 1 : 0) };
  }
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

type GroupPage<T> = { key: string; items: T[]; hasMore: boolean; sums: GroupValueSums | undefined };

type HasId = { id: string };

type FetchResult<T> = {
  items: T[];
  total: number;
  grouping?: GroupingResult;
  groupCounts?: Record<string, number>;
  groupValueSums?: Record<string, GroupValueSums>;
  valueSums?: GroupValueSums;
};

type ViewContext = {
  activeViewKey: string;
  views: DataViewChipDto[];
  view: DataViewChipDto | undefined;
  base: DataViewState | undefined;
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
      base: context.base,
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
    const requested = normaliseGroupingRequest(params, resolved);
    const groupableSpecs = await this.repo.getGroupableFields(customColumns);
    const resolvedGrouping = resolveGrouping(requested.grouping, groupableSpecs);

    const { items, total, grouping, groupCounts, groupValueSums } = resolvedGrouping
      ? await this.fetchGrouped(baseQuery, resolvedGrouping, requested.page)
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
        ...(grouping ? { grouping } : {}),
        ...(groupableSpecs.length > 0 ? { groupableFields: groupableFieldDtos(groupableSpecs) } : {}),
        groupCounts,
        groupValueSums,
        valueSums,
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
    resolved: ResolvedGrouping,
    page: GroupPageRequest,
  ): Promise<FetchResult<T>> {
    const { spec, grouping } = resolved;
    const now = new Date().toISOString();

    if (page.only !== undefined) return this.fetchOneGroup(baseQuery, resolved, page, now);

    const [rows, total] = await Promise.all([
      this.repo.countByGroup({
        spec,
        params: baseQuery,
        bucket: grouping.bucket,
        sumFields: this.groupValueSumFields,
        now,
      }),
      this.repo.getCount({ filters: baseQuery.filters, searchTerm: baseQuery.searchTerm }),
    ]);

    const labels = await this.repo.resolveGroupLabels(
      spec,
      rows.map((row) => row.key),
    );
    const axis = resolveGroupAxis({
      spec,
      bucket: grouping.bucket,
      now,
      rows,
      labels,
      collator: this.repo.collator(),
    });

    const collapsed = new Set(page.collapsed ?? []);
    const materialised = axis.groups.filter((group) => !collapsed.has(group.key)).slice(0, MAX_MATERIALISED_GROUPS);
    const wantsSums = page.includeValueSums !== false && this.groupValueSumFields.length > 0 && spec.kind !== "enum";

    const pages = await Promise.all(
      materialised.map(async (group): Promise<GroupPage<T>> => {
        const groupScope = { spec, key: group.key, bucket: grouping.bucket, now };
        const take = page.overrides?.[group.key] ?? page.perGroup ?? GROUP_PAGE_SIZE_DEFAULT;

        const [items, sums] = await Promise.all([
          this.repo.getItems({ ...baseQuery, groupScope, take: take + 1, skip: 0 }),
          wantsSums ? this.sumDeclaredFields({ ...baseQuery, groupScope }) : Promise.resolve(undefined),
        ]);

        return { key: group.key, items: items.slice(0, take), hasMore: items.length > take, sums };
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
        supportsDragWriteBack: spec.kind === "customSingleSelect",
        ...(spec.kind === "customSingleSelect" ? { columnId: spec.columnId } : {}),
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
    base: undefined,
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
      ...(page.sums === undefined ? {} : { valueSums: page.sums }),
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

  const summed = groups.flatMap((group) => (group.valueSums ? [[group.key, group.valueSums] as const] : []));
  const membershipTotal = input.rows.reduce((sum, row) => sum + row.count, 0);

  return {
    items,
    total: input.total,
    grouping: {
      grouping: input.grouping,
      kind: input.spec.kind,
      supportsDragWriteBack: input.spec.kind === "customSingleSelect",
      ...(input.spec.kind === "customSingleSelect" ? { columnId: input.spec.columnId } : {}),
      groups,
      total: input.total,
      ...(input.spec.kind === "relation" ? { membershipTotal } : {}),
      ...(input.axis.overflow ? { overflow: input.axis.overflow } : {}),
    },
    groupCounts: Object.fromEntries(groups.map((group) => [group.key, group.count])),
    groupValueSums: summed.length > 0 ? Object.fromEntries(summed) : undefined,
  };
}
