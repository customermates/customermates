import type { GetQueryParams } from "@/core/base/base-get.schema";
import type { GroupableFieldDto } from "@/core/base/grouping/groupable-field";
import type { GroupPageRequest, Grouping, GroupingResult } from "@/core/base/grouping/grouping.schema";
import type { ColumnPresentation } from "@/core/data-view/column-presentation.schema";
import type { DataViewSurfaceKey } from "@/core/data-view/data-view-keys";
import type { DataViewChipDto, DataViewState } from "@/core/data-view/data-view-state.schema";
import { isPersistedColumnWidthKey } from "@/core/data-view/data-view-state.schema";
import type { ObservableSet } from "mobx";
import type { RootStore } from "../stores/root.store";
import type { GetResult } from "./base-get.interactor";
import type { Filter, FilterableField, PaginationRequest, SortDescriptor } from "./base-get.schema";

import deepEqual from "fast-deep-equal/es6";
import { action, computed, makeObservable, observable, runInAction, toJS } from "mobx";

import type { Resource } from "@/generated/prisma";
import { Action } from "@/generated/prisma";

import { reportApplicationError } from "../errors/report-application-error";
import { toastZodErrorTree } from "../utils/toast-zod-error-tree";

import { ViewMode } from "./base-query-builder";
import { BaseStore } from "./base.store";

import { saveDataViewStateAction, selectDataViewAction } from "@/app/actions";
import { GROUP_PAGE_SIZE_DEFAULT, encodeGroupingToken, sameGrouping } from "@/core/base/grouping/grouping.schema";
import { ALL_VIEW_KEY } from "@/core/data-view/data-view-keys";
import { reserveViewStateWrite, type ViewStateWriteIntent } from "@/core/data-view/view-state-persistence";

export const MAX_SELECTION_SIZE = 100;

export interface HasId {
  id: string;
}

export type TableColumn = {
  uid: string;
  sortable?: boolean;
  label?: string;
  width?: number;
};

export type DataViewRequestState =
  | { readonly status: "uninitialized" }
  | { readonly status: "ready" }
  | { readonly status: "refreshing" }
  | { readonly status: "refresh-error"; readonly error: unknown };

export type DataViewRefreshMode = "background" | "visible";

type SelectionScope = { filters: Filter[]; searchTerm: string | null };

export abstract class BaseDataViewStore<Entity extends HasId> extends BaseStore {
  items: Entity[] = [];

  searchTerm: string | undefined;
  pagination: (PaginationRequest & { totalPages?: number; total?: number }) | undefined;
  sortDescriptor: SortDescriptor | undefined;
  filters: Filter[] | undefined = undefined;
  filterableFields: FilterableField[] = [];

  p13nId?: string;
  resetToSharedDefaults?: () => Promise<void>;
  columnOrder: string[] = [];
  columnWidths: Record<string, number> = {};
  hiddenColumns: string[] = [];
  views: DataViewChipDto[] = [];
  allViewState: DataViewState = {};
  activeViewKey: string = ALL_VIEW_KEY;
  viewPersistable = true;
  viewMode: ViewMode = ViewMode.table;
  grouping?: Grouping | null;
  groupingResult?: GroupingResult;
  groupableFields: GroupableFieldDto[] = [];
  collapsedGroupKeys: ObservableSet<string> = observable.set();
  selectedIds: ObservableSet<string> = observable.set();
  selectedScope: SelectionScope | undefined = undefined;

  groupCounts: Record<string, number> = {};
  groupedTakeOverrides: Record<string, number> = {};

  public readonly resource?: Resource;

  private persistViewStateTimer?: number;
  private pendingViewStateIntent?: ViewStateWriteIntent;
  private pendingGroupOnly?: string;
  private requestGeneration = 0;
  private viewStateWrites = new Map<string, number>();
  private viewStateWriteSeq = 0;
  private backgroundRefreshRunning = false;
  private backgroundRefreshQueued = false;
  private requestState: DataViewRequestState = { status: "uninitialized" };
  private onChangesCallbacks: (() => void | Promise<void>)[] = [];

  schemaSettingsHref?: string;
  viewPathname?: string;
  viewSyncToUrl = true;
  get supportsSelection(): boolean {
    return false;
  }
  get recordLabels(): { singular: string; plural: string } | undefined {
    return undefined;
  }
  get viewTypeLabel(): string | undefined {
    return undefined;
  }

  async moveItemBetweenGroups(_params: {
    item: Entity;
    optimisticItem: Entity;
    fromGroupKey: string;
    toGroupKey: string;
    value: string | null;
  }): Promise<void> {}

  abstract get columnsDefinition(): TableColumn[];

  get primaryColumnId(): string {
    return "name";
  }

  constructor(rootStore: RootStore, resource?: Resource) {
    super(rootStore);
    this.resource = resource;

    makeObservable<this, "requestState">(this, {
      requestState: observable.ref,
      dataRequest: computed,
      isRefreshing: computed,
      isReady: computed,

      items: observable,

      searchTerm: observable,
      filters: observable,
      filterableFields: observable,
      pagination: observable,
      sortDescriptor: observable,

      p13nId: observable,
      hiddenColumns: observable,
      columnOrder: observable,
      columnWidths: observable,
      views: observable,
      allViewState: observable,
      activeViewKey: observable,
      viewPersistable: observable,
      viewMode: observable,
      grouping: observable,
      groupingResult: observable.ref,
      groupableFields: observable,
      collapsedGroupKeys: observable,
      selectedIds: observable,
      selectedScope: observable.ref,

      groupCounts: observable,
      groupedTakeOverrides: observable,

      filterColumns: computed,
      orderedColumns: computed,
      visibleColumns: computed,
      sortableColumnIds: computed,
      canManage: computed,
      canExport: computed,
      isDisabled: computed,
      hasSelection: computed,
      selectedCount: computed,
      selectedVisibleCount: computed,
      selectedOffViewCount: computed,
      isSelectionAtLimit: computed,
      currentSelectionScope: computed,
      isSelectionScopeStale: computed,
      canBoard: computed,
      isGrouped: computed,
      groupingKey: computed,
      currentGroupableFieldId: computed,

      setViewOptions: action,
      setQueryOptions: action,
      appendFilter: action,
      replaceFilterAt: action,
      removeFilterAt: action,
      applyView: action,
      refresh: action,
      upsertItem: action,
      upsertItemLocal: action,
      removeItem: action,
      registerOnChange: action,
      executeOnChanges: action,
      setItems: action,
      setSelectedIds: action,
      toggleItemSelection: action,
      setPageSelection: action,
      keepSelectionInView: action,
      clearSelection: action,
      loadMoreInGroup: action,
      toggleGroupCollapsed: action,
      setGroupSelection: action,
      resetGroupedTakeOverrides: action,
    });
  }

  get isReady(): boolean {
    return this.requestState.status !== "uninitialized";
  }

  get dataRequest(): DataViewRequestState {
    return this.requestState;
  }

  get isRefreshing(): boolean {
    return this.requestState.status === "refreshing";
  }

  canMoveItemBetweenGroups(item: Entity): boolean {
    return Boolean(item.id);
  }

  get filterColumns(): ColumnPresentation[] {
    return [];
  }

  get canBoard(): boolean {
    return this.groupableFields.length > 0;
  }

  get isGrouped(): boolean {
    return Boolean(this.grouping && this.groupingResult);
  }

  get groupingKey(): string {
    return this.grouping ? encodeGroupingToken(this.grouping) : "";
  }

  get currentGroupableFieldId(): string {
    const grouping = this.grouping;
    if (!grouping) return "";

    return this.groupableFields.find((field) => sameGrouping(field.grouping, grouping))?.id ?? "";
  }

  get sortableColumnIds(): Set<string> {
    return new Set(this.columnsDefinition.filter((col) => col.sortable).map((col) => col.uid));
  }

  get canManage(): boolean {
    if (!this.resource) return true;

    return this.rootStore.userStore.can(this.resource, Action.create);
  }

  get canExport(): boolean {
    if (!this.resource) return false;

    return this.rootStore.userStore.canAccess(this.resource);
  }

  get isDisabled(): boolean {
    if (!this.resource) return false;

    return !this.canManage;
  }

  get hasSelection(): boolean {
    return this.selectedIds.size > 0;
  }

  get selectedCount(): number {
    return this.selectedIds.size;
  }

  get selectedVisibleCount(): number {
    return this.items.reduce((count, item) => (this.selectedIds.has(item.id) ? count + 1 : count), 0);
  }

  get selectedOffViewCount(): number {
    return this.selectedCount - this.selectedVisibleCount;
  }

  get isSelectionAtLimit(): boolean {
    return this.selectedIds.size >= MAX_SELECTION_SIZE;
  }

  get currentSelectionScope(): SelectionScope {
    return {
      filters: toJS(this.filters) ?? [],
      searchTerm: this.searchTerm || null,
    };
  }

  get isSelectionScopeStale(): boolean {
    if (!this.hasSelection || this.selectedScope === undefined) return false;

    return !deepEqual(this.selectedScope, this.currentSelectionScope);
  }

  isItemSelectable(_item: Entity): boolean {
    return true;
  }

  setSelectedIds = (keys: Set<string>) => {
    this.selectedIds.clear();
    this.onSelectionChanged();
    this.selectedScope = undefined;
    [...keys].slice(0, MAX_SELECTION_SIZE).forEach((id) => this.selectedIds.add(id));
    this.rememberSelectionScope();
  };

  toggleItemSelection = (id: string): void => {
    if (this.selectedIds.has(id)) {
      this.selectedIds.delete(id);
      this.rememberSelectionScope();
      return;
    }

    if (this.isSelectionAtLimit) {
      this.toastError("MassActions.limitReached", {
        values: { limit: MAX_SELECTION_SIZE },
      });
      return;
    }

    this.selectedIds.add(id);
    this.rememberSelectionScope();
  };

  setPageSelection = (selected: boolean): void => {
    const pageIds = this.items.filter((item) => this.isItemSelectable(item)).map((item) => item.id);

    if (!selected) {
      pageIds.forEach((id) => this.selectedIds.delete(id));
      this.rememberSelectionScope();
      return;
    }

    const missing = pageIds.filter((id) => !this.selectedIds.has(id));
    const room = Math.max(0, MAX_SELECTION_SIZE - this.selectedIds.size);
    missing.slice(0, room).forEach((id) => this.selectedIds.add(id));
    this.rememberSelectionScope();

    if (missing.length > room) {
      this.toastError("MassActions.limitReached", {
        values: { limit: MAX_SELECTION_SIZE },
      });
    }
  };

  keepSelectionInView = (): void => {
    const visible = new Set(this.items.map((item) => item.id));
    for (const id of [...this.selectedIds]) if (!visible.has(id)) this.selectedIds.delete(id);
    this.selectedScope = this.selectedIds.size > 0 ? this.currentSelectionScope : undefined;
    this.onSelectionChanged();
  };

  clearSelection = () => {
    this.selectedIds.clear();
    this.selectedScope = undefined;
    this.onSelectionChanged();
  };

  protected onSelectionChanged(): void {}

  private rememberSelectionScope(): void {
    this.onSelectionChanged();
    if (this.selectedIds.size === 0) {
      this.selectedScope = undefined;
      return;
    }

    if (this.selectedScope === undefined) this.selectedScope = this.currentSelectionScope;
  }

  get orderedColumns() {
    const columnMap = new Map(this.columnsDefinition.map((col) => [col.uid, col]));
    const orderedUids = new Set(this.columnOrder);
    const nameColumn = this.columnsDefinition.find((col) => col.uid === this.primaryColumnId);

    if (this.columnOrder.length > 0) {
      const columnsFromOrder = this.columnOrder
        .map((uid) => columnMap.get(uid))
        .filter((column): column is TableColumn => column !== undefined && column.uid !== this.primaryColumnId);

      const columnsNotInOrder = this.columnsDefinition.filter(
        (col) => !orderedUids.has(col.uid) && col.uid !== this.primaryColumnId,
      );

      const res: TableColumn[] = [];
      if (nameColumn) res.push(nameColumn);
      res.push(...columnsFromOrder, ...columnsNotInOrder);

      return res;
    }

    const remainingColumns = this.columnsDefinition.filter((col) => col.uid !== this.primaryColumnId);

    const res: TableColumn[] = [];
    if (nameColumn) res.push(nameColumn);
    res.push(...remainingColumns);

    return res;
  }

  get visibleColumns(): TableColumn[] {
    const hidden = new Set(this.hiddenColumns);
    return this.orderedColumns.filter((column) => !hidden.has(column.uid));
  }

  setItems(args: GetResult<Entity>): void {
    if (args.grouping?.partial) {
      this.mergeGroupPage(args);
      return;
    }

    this.requestGeneration += 1;
    this.items = args.items;
    this.p13nId = args.p13nId;
    this.filterableFields = args.filterableFields || [];
    this.searchTerm = args.searchTerm;
    this.sortDescriptor = args.sortDescriptor;
    this.pagination = args.pagination;
    this.filters = this.withKnownFields(args.filters);
    this.columnWidths = args.columnWidths || {};
    this.hiddenColumns = (args.hiddenColumns ?? []).filter((uid) => uid !== this.primaryColumnId);
    this.columnOrder = (args.columnOrder ?? []).filter((uid) => uid !== this.primaryColumnId);
    this.viewMode = args.viewMode ?? ViewMode.table;
    this.grouping = args.grouping?.grouping ?? null;
    this.groupingResult = args.grouping;
    this.groupableFields = args.groupableFields ?? [];
    this.views = args.views ?? [];
    this.allViewState = args.allState ?? this.allViewState;
    this.activeViewKey = args.activeViewKey ?? ALL_VIEW_KEY;
    this.viewPersistable = args.viewPersistable ?? true;
    this.groupCounts = args.groupCounts ?? {};
    this.requestState = { status: "ready" };
  }

  private mergeGroupPage(args: GetResult<Entity>): void {
    const page = args.grouping?.groups[0];
    const current = this.groupingResult;
    if (!page || !current) return;

    this.requestGeneration += 1;

    const merged = new Map(this.items.map((item) => [item.id, item]));
    for (const item of args.items) merged.set(item.id, item);

    this.items = [...merged.values()];
    this.groupingResult = {
      ...current,
      groups: current.groups.map((group) =>
        group.key === page.key
          ? {
              ...group,
              itemIds: page.itemIds,
              hasMore: page.hasMore,
              materialised: true,
            }
          : group,
      ),
    };
    this.requestState = { status: "ready" };
  }

  loadMoreInGroup = (groupKey: string): void => {
    const current = this.groupedTakeOverrides[groupKey] ?? GROUP_PAGE_SIZE_DEFAULT;
    this.groupedTakeOverrides = {
      ...this.groupedTakeOverrides,
      [groupKey]: current + GROUP_PAGE_SIZE_DEFAULT,
    };
    this.pendingGroupOnly = groupKey;
    this.refreshQueryInBackground();
  };

  isGroupCollapsed = (groupKey: string): boolean => this.collapsedGroupKeys.has(groupKey);

  toggleGroupCollapsed = (groupKey: string): void => {
    if (!this.collapsedGroupKeys.has(groupKey)) {
      this.collapsedGroupKeys.add(groupKey);
      return;
    }

    this.collapsedGroupKeys.delete(groupKey);

    const group = this.groupingResult?.groups.find((candidate) => candidate.key === groupKey);
    if (!group || group.materialised || group.count === 0) return;

    this.pendingGroupOnly = groupKey;
    this.refreshInBackground();
  };

  setGroupSelection = (groupKey: string, selected: boolean): void => {
    const inGroup = new Set(this.groupingResult?.groups.find((group) => group.key === groupKey)?.itemIds ?? []);
    const groupIds = this.items
      .filter((item) => inGroup.has(item.id) && this.isItemSelectable(item))
      .map((item) => item.id);

    if (!selected) {
      groupIds.forEach((id) => this.selectedIds.delete(id));
      this.rememberSelectionScope();
      return;
    }

    const missing = groupIds.filter((id) => !this.selectedIds.has(id));
    const room = Math.max(0, MAX_SELECTION_SIZE - this.selectedIds.size);
    missing.slice(0, room).forEach((id) => this.selectedIds.add(id));
    this.rememberSelectionScope();

    if (missing.length > room) {
      this.toastError("MassActions.limitReached", {
        values: { limit: MAX_SELECTION_SIZE },
      });
    }
  };

  resetGroupedTakeOverrides = (): void => {
    if (Object.keys(this.groupedTakeOverrides).length === 0) return;
    this.groupedTakeOverrides = {};
  };

  setViewOptions = (updates: {
    columnOrder?: string[];
    columnWidth?: { uid: string; width: number };
    columnWidths?: Record<string, number>;
    hiddenColumns?: string[];
    viewMode?: ViewMode;
    grouping?: Grouping | null;
  }) => {
    let hasChanges = false;
    const groupingBefore = this.groupingKey;

    if (updates.columnOrder) {
      const newColumnOrder = updates.columnOrder.filter((uid) => uid !== this.primaryColumnId);

      const orderChanged =
        this.columnOrder.length !== newColumnOrder.length ||
        this.columnOrder.some((uid, index) => uid !== newColumnOrder[index]);

      if (orderChanged) {
        this.columnOrder = newColumnOrder;
        hasChanges = true;
      }
    }

    if (updates.columnWidth) {
      const newWidths = { ...this.columnWidths };
      newWidths[updates.columnWidth.uid] = Math.max(80, updates.columnWidth.width);

      if (!deepEqual(this.columnWidths, newWidths)) {
        this.columnWidths = newWidths;
        hasChanges = true;
      }
    }

    if (updates.columnWidths) {
      if (!deepEqual(this.columnWidths, updates.columnWidths)) {
        this.columnWidths = updates.columnWidths;
        hasChanges = true;
      }
    }

    if (updates.hiddenColumns) {
      const filteredHiddenColumns = updates.hiddenColumns.filter((uid) => uid !== this.primaryColumnId);
      if (!deepEqual(this.hiddenColumns, filteredHiddenColumns)) {
        this.hiddenColumns = filteredHiddenColumns;
        hasChanges = true;
      }
    }

    const viewModeChanged = "viewMode" in updates && this.viewMode !== updates.viewMode;
    if (viewModeChanged) {
      this.viewMode = updates.viewMode ?? ViewMode.table;
      hasChanges = true;
    }

    if ("grouping" in updates && !sameGrouping(this.grouping, updates.grouping)) {
      this.grouping = updates.grouping ?? null;
      hasChanges = true;
    }

    const groupingChanged = groupingBefore !== this.groupingKey;
    if (groupingChanged) {
      this.resetGroupedTakeOverrides();
      this.collapsedGroupKeys.clear();
      this.resetPaginationPage();
    }

    if (hasChanges) this.persistViewState();
    if (groupingChanged) this.refreshQueryInBackground();
    else if (viewModeChanged && this.viewMode === ViewMode.card && this.grouping) this.refreshInBackground();
  };

  setQueryOptions = (updates: {
    filters?: Filter[];
    pagination?: PaginationRequest;
    sortDescriptor?: SortDescriptor | undefined;
    searchTerm?: string;
    forceRefresh?: boolean;
    refreshMode?: DataViewRefreshMode;
  }) => {
    let hasChanges = false;
    let queryShapeChanged = false;
    let durableChanged = false;

    if (updates.filters !== undefined && !deepEqual(this.filters, updates.filters)) {
      this.filters = updates.filters;
      hasChanges = true;
      queryShapeChanged = true;
      durableChanged = true;
    }

    if (updates.pagination) {
      const newPagination: PaginationRequest = this.pagination
        ? { ...this.pagination, ...updates.pagination }
        : {
            page: updates.pagination.page,
            pageSize: updates.pagination.pageSize,
          };

      if (!deepEqual(this.pagination, newPagination)) {
        const pageSizeChanged = this.pagination?.pageSize !== newPagination.pageSize;
        this.pagination = newPagination;
        hasChanges = true;
        if (pageSizeChanged) durableChanged = true;
      }
    }

    if ("sortDescriptor" in updates && !deepEqual(this.sortDescriptor, updates.sortDescriptor)) {
      this.sortDescriptor = updates.sortDescriptor;
      hasChanges = true;
      queryShapeChanged = true;
      durableChanged = true;
    }

    if (updates.searchTerm !== undefined && (this.searchTerm || undefined) !== (updates.searchTerm || undefined)) {
      this.searchTerm = updates.searchTerm;
      hasChanges = true;
      queryShapeChanged = true;
      durableChanged = true;
    }

    if (queryShapeChanged) {
      this.resetPaginationPage();
      this.resetGroupedTakeOverrides();
    }

    if (durableChanged) this.persistViewState();

    if (!hasChanges && !updates.forceRefresh) return;

    if (updates.refreshMode === "background") this.refreshInBackground();
    else this.refreshQueryInBackground();
  };

  appendFilter = (filter: Filter) => {
    this.setQueryOptions({ filters: [...(this.filters ?? []), filter] });
  };

  replaceFilterAt = (index: number, filter: Filter) => {
    const current = this.filters ?? [];
    if (index < 0 || index >= current.length) return;

    this.setQueryOptions({
      filters: current.map((entry, position) => (position === index ? filter : entry)),
    });
  };

  removeFilterAt = (index: number) => {
    const current = this.filters ?? [];
    if (index < 0 || index >= current.length) return;

    this.setQueryOptions({
      filters: current.filter((_, position) => position !== index),
    });
  };

  applyView = (viewKey: string): void => {
    const previousKey = this.activeViewKey;
    const flushed = this.flushPendingViewState();
    const chip = this.views.find((view) => view.id === viewKey);
    const key = chip ? chip.id : ALL_VIEW_KEY;
    const state: DataViewState = chip?.state ?? this.allViewState;

    runInAction(() => {
      this.requestGeneration += 1;
      if (this.isReady) this.requestState = { status: "refreshing" };
      this.activeViewKey = key;
      this.filters = this.withKnownFields(state.filters);
      this.searchTerm = state.searchTerm;
      this.sortDescriptor = state.sortDescriptor ?? undefined;
      this.viewMode = state.viewMode ?? ViewMode.table;
      this.grouping = state.grouping ?? null;
      this.columnOrder = (state.columnOrder ?? []).filter((uid) => uid !== this.primaryColumnId);
      this.columnWidths = state.columnWidths ?? {};
      this.hiddenColumns = (state.hiddenColumns ?? []).filter((uid) => uid !== this.primaryColumnId);
      this.pagination = this.pagination
        ? {
            ...this.pagination,
            page: 1,
            pageSize: state.pageSize ?? this.pagination.pageSize,
          }
        : this.pagination;
      this.groupedTakeOverrides = {};
      this.collapsedGroupKeys.clear();
    });

    if (this.p13nId && this.viewPersistable) {
      void selectDataViewAction({
        surfaceKey: this.p13nId as DataViewSurfaceKey,
        viewKey: key,
      }).catch(reportApplicationError);
    }

    if (flushed && key === previousKey) void flushed.then(this.refreshResolvedInBackground);
    else this.refreshResolvedInBackground();
  };

  private withKnownFields(filters: Filter[] | undefined): Filter[] {
    const list = filters ?? [];
    if (this.filterableFields.length === 0) return list;
    const known = new Set(this.filterableFields.map((f) => f.field));
    return list.filter((f) => known.has(f.field));
  }

  refresh = (): Promise<void> => this.executeRefresh("background");

  protected refreshGuarded = (shouldCommit: () => boolean): Promise<void> =>
    this.executeRefresh("background", shouldCommit);

  private executeRefresh = async (
    mode: DataViewRefreshMode,
    shouldCommit?: () => boolean,
    resolveFromServer = false,
  ): Promise<void> => {
    const generation = ++this.requestGeneration;
    const wasInitialized = this.isReady;
    const writeSeqBeforeRequest = this.viewStateWriteSeq;
    const projectionBeforeRequest = {
      surfaceKey: this.p13nId,
      viewKey: this.activeViewKey,
      columnOrder: toJS(this.columnOrder),
      columnWidths: toJS(this.columnWidths),
      hiddenColumns: toJS(this.hiddenColumns),
    };
    const pendingProjectionAtStart =
      !resolveFromServer &&
      (this.persistViewStateTimer !== undefined ||
        this.queuedViewStateWrites.has(JSON.stringify([this.p13nId, this.activeViewKey])) ||
        this.failedViewStateWrites.has(this.activeViewKey));
    const groupPage = this.buildGroupPageRequest();
    const params: GetQueryParams = resolveFromServer
      ? {
          p13nId: this.p13nId,
          viewId: this.activeViewKey,
        }
      : {
          p13nId: this.p13nId,
          viewId: wasInitialized ? this.activeViewKey : undefined,
          filters: toJS(this.filters),
          searchTerm: toJS(this.searchTerm),
          sortDescriptor: toJS(this.sortDescriptor),
          ...(groupPage
            ? { groupPage, pageSize: this.pagination?.pageSize }
            : {
                pagination: this.pagination
                  ? {
                      page: this.pagination.page,
                      pageSize: this.pagination.pageSize,
                    }
                  : undefined,
              }),
          viewMode: this.viewMode,
          grouping: toJS(this.grouping),
        };

    runInAction(() => {
      if (mode === "visible") this.requestState = { status: "refreshing" };
    });

    const discardIfStale = (): boolean => {
      const ownsRequest = generation === this.requestGeneration;
      const ownsGuard = shouldCommit?.() ?? true;
      if (ownsRequest && ownsGuard) return false;

      if (ownsRequest && !ownsGuard && this.requestState.status === "refreshing") {
        runInAction(() => {
          this.requestState = wasInitialized ? { status: "ready" } : { status: "uninitialized" };
        });
      }

      return true;
    };

    let result: GetResult<Entity>;
    try {
      result = await this.refreshAction(params);
    } catch (error) {
      if (discardIfStale()) return;

      runInAction(() => {
        this.requestState = wasInitialized ? { status: "refresh-error", error } : { status: "uninitialized" };
      });
      throw error;
    }

    if (discardIfStale()) return;

    runInAction(() => {
      const localAllState = this.allViewState;
      const localViews = this.views;
      const localProjection = {
        columnOrder: toJS(this.columnOrder),
        columnWidths: toJS(this.columnWidths),
        hiddenColumns: toJS(this.hiddenColumns),
      };
      const sameProjectionScope =
        wasInitialized &&
        projectionBeforeRequest.surfaceKey !== undefined &&
        projectionBeforeRequest.surfaceKey === this.p13nId &&
        projectionBeforeRequest.viewKey === this.activeViewKey &&
        projectionBeforeRequest.surfaceKey === result.p13nId &&
        projectionBeforeRequest.viewKey === (result.activeViewKey ?? ALL_VIEW_KEY);
      const keepOrder =
        sameProjectionScope &&
        (pendingProjectionAtStart || !deepEqual(localProjection.columnOrder, projectionBeforeRequest.columnOrder));
      const keepWidths =
        sameProjectionScope &&
        (pendingProjectionAtStart || !deepEqual(localProjection.columnWidths, projectionBeforeRequest.columnWidths));
      const keepHidden =
        sameProjectionScope &&
        (pendingProjectionAtStart || !deepEqual(localProjection.hiddenColumns, projectionBeforeRequest.hiddenColumns));

      this.onRefreshAccepted(result);
      this.setItems(result);
      const available = new Set(this.columnsDefinition.map((column) => column.uid));
      if (keepOrder)
        this.columnOrder = localProjection.columnOrder.filter((id) => available.has(id) && id !== this.primaryColumnId);
      if (keepWidths) {
        this.columnWidths = Object.fromEntries(
          Object.entries(localProjection.columnWidths).filter(([id]) => isPersistedColumnWidthKey(id, available)),
        );
      }
      if (keepHidden) {
        this.hiddenColumns = localProjection.hiddenColumns.filter(
          (id) => available.has(id) && id !== this.primaryColumnId,
        );
      }
      this.restoreViewStateWrittenDuringRequest(writeSeqBeforeRequest, localAllState, localViews);
    });
  };

  private buildGroupPageRequest(): GroupPageRequest | undefined {
    const only = this.pendingGroupOnly;
    this.pendingGroupOnly = undefined;

    if (!this.grouping) return undefined;

    return {
      perGroup: GROUP_PAGE_SIZE_DEFAULT,
      ...(Object.keys(this.groupedTakeOverrides).length > 0 ? { overrides: toJS(this.groupedTakeOverrides) } : {}),
      ...(this.collapsedGroupKeys.size > 0 ? { collapsed: [...this.collapsedGroupKeys] } : {}),
      ...(only === undefined ? {} : { only }),
    };
  }

  upsertItem = async (target: Entity, options: { created?: boolean } = {}): Promise<void> => {
    const isLoaded = this.items.some(({ id }) => id === target.id);
    this.upsertItemLocal(target);
    if (options.created && !isLoaded) this.adjustPaginationTotal(1);
    this.requestGeneration += 1;
    if (this.requestState.status !== "uninitialized") this.requestState = { status: "ready" };
    await this.executeOnChanges();
  };

  upsertItemLocal = (target: Entity): void => {
    const targetId = target.id;
    const existingIndex = this.items.findIndex(({ id: sourceId }) => sourceId === targetId);

    this.items =
      existingIndex >= 0
        ? this.items.map((source) => (source.id === targetId ? target : source))
        : [...this.items, target];
  };

  removeItem = async (targetId: string): Promise<void> => {
    const items = this.items.filter(({ id: sourceId }) => sourceId !== targetId);

    if (items.length < this.items.length) this.adjustPaginationTotal(-1);
    this.items = items;
    this.requestGeneration += 1;
    if (this.requestState.status !== "uninitialized") this.requestState = { status: "ready" };
    await this.executeOnChanges();
  };

  private adjustPaginationTotal(delta: number): void {
    if (this.pagination?.total === undefined) return;

    const total = Math.max(0, this.pagination.total + delta);
    this.pagination = {
      ...this.pagination,
      total,
      totalPages: Math.max(1, Math.ceil(total / this.pagination.pageSize)),
    };
  }

  registerOnChange = (callback: () => void | Promise<void>): (() => void) => {
    this.onChangesCallbacks.push(callback);

    return () => {
      const index = this.onChangesCallbacks.indexOf(callback);
      if (index > -1) this.onChangesCallbacks.splice(index, 1);
    };
  };

  executeOnChanges = async () => {
    const promises = this.onChangesCallbacks.map((callback) => callback());

    await Promise.all(promises);
  };

  async refreshQuery(): Promise<void> {
    if (!this.isReady) return;

    try {
      await this.executeRefresh("visible");
    } catch (error) {
      this.toastError("Common.notifications.unexpectedError");
      throw error;
    }
  }

  private refreshQueryInBackground = (): void => {
    void this.refreshQuery().catch(() => undefined);
  };

  reloadSavedView = (): Promise<void> => this.executeRefresh(this.isReady ? "visible" : "background", undefined, true);

  private refreshResolvedInBackground = (): void => {
    void this.executeRefresh(this.isReady ? "visible" : "background", undefined, true).catch(() => undefined);
  };

  refreshInBackground = (): void => {
    if (!this.isReady) return;

    if (this.backgroundRefreshRunning) {
      this.backgroundRefreshQueued = true;
      return;
    }

    void this.drainBackgroundRefreshes();
  };

  private drainBackgroundRefreshes = async (): Promise<void> => {
    this.backgroundRefreshRunning = true;

    try {
      do {
        this.backgroundRefreshQueued = false;
        try {
          await this.executeRefresh("background", () => !this.backgroundRefreshQueued);
        } catch {
          this.toastError("Common.notifications.unexpectedError");
        }
      } while (this.backgroundRefreshQueued);
    } finally {
      this.backgroundRefreshRunning = false;
    }
  };

  protected onRefreshAccepted(_result: GetResult<Entity>): void {}

  protected get viewStateWriteOwner(): string | undefined {
    return undefined;
  }

  protected canPersistViewState(): boolean {
    return true;
  }

  protected refreshAction(_params?: GetQueryParams): Promise<GetResult<Entity>> {
    return Promise.reject(new Error("refreshAction must be implemented by entity stores"));
  }

  discardPendingViewState = (): void => {
    this.cancelPendingPersist();
    this.pendingViewStateIntent?.discard();
    this.pendingViewStateIntent = undefined;
  };

  private viewStateWrite: Promise<void> | undefined;
  private queuedViewStateWrites = new Map<string, number>();
  private failedViewStateWrites = new Set<string>();

  settleViewState = async (): Promise<void> => {
    const viewKey = this.activeViewKey;
    const flushed = this.flushPendingViewState();
    if (!flushed && this.failedViewStateWrites.has(viewKey)) void this.writeViewState();
    await this.viewStateWrite;
    if (this.failedViewStateWrites.has(viewKey)) throw new Error("The current view could not be saved.");
  };

  private cancelPendingPersist = (): boolean => {
    if (this.persistViewStateTimer === undefined) return false;

    clearTimeout(this.persistViewStateTimer);
    this.persistViewStateTimer = undefined;
    return true;
  };

  protected flushPendingViewState = (): Promise<void> | undefined => {
    if (!this.cancelPendingPersist()) return undefined;

    return this.writeViewState();
  };

  private persistViewState = () => {
    if (!this.p13nId || !this.viewPersistable || !this.canPersistViewState()) return;

    this.discardPendingViewState();
    this.pendingViewStateIntent = this.reserveViewStateIntent();

    this.persistViewStateTimer = window.setTimeout(() => {
      this.persistViewStateTimer = undefined;
      void this.writeViewState();
    }, 1000);
  };

  private reserveViewStateIntent = (): ViewStateWriteIntent | undefined => {
    const owner = this.viewStateWriteOwner;
    return owner === undefined
      ? undefined
      : reserveViewStateWrite(this.rootStore, JSON.stringify([owner, this.p13nId, this.activeViewKey]));
  };

  private writeViewState = (): Promise<void> => {
    if (!this.canPersistViewState()) {
      this.discardPendingViewState();
      return Promise.resolve();
    }
    const intent = this.pendingViewStateIntent ?? this.reserveViewStateIntent();
    this.pendingViewStateIntent = undefined;
    const viewKey = this.activeViewKey;
    const state: DataViewState = {
      filters: toJS(this.filters) ?? [],
      searchTerm: this.searchTerm ?? "",
      sortDescriptor: toJS(this.sortDescriptor) ?? null,
      pageSize: this.pagination?.pageSize,
      viewMode: toJS(this.viewMode),
      grouping: toJS(this.grouping) ?? null,
      columnOrder: toJS(this.columnOrder),
      columnWidths: toJS(this.columnWidths),
      hiddenColumns: toJS(this.hiddenColumns),
    };

    const surfaceKey = this.p13nId as DataViewSurfaceKey;
    const ownsWrite = () => this.canPersistViewState() && (!intent || intent.isCurrent());
    const persist = () => {
      if (!ownsWrite()) return Promise.resolve();
      return saveDataViewStateAction({ surfaceKey, viewKey, state })
        .then((res) => {
          if (!ownsWrite()) return;
          if (!res.ok) {
            this.failedViewStateWrites.add(viewKey);
            toastZodErrorTree(res.error);
            return;
          }

          this.failedViewStateWrites.delete(viewKey);
          this.rememberViewState(viewKey, state);
        })
        .catch((error) => {
          if (!ownsWrite()) return;
          this.failedViewStateWrites.add(viewKey);
          reportApplicationError(error);
        });
    };
    const pendingKey = JSON.stringify([surfaceKey, viewKey]);
    this.queuedViewStateWrites.set(pendingKey, (this.queuedViewStateWrites.get(pendingKey) ?? 0) + 1);
    const enqueue = () => (intent ? intent.enqueue(persist) : persist());
    const write = this.viewStateWrite ? this.viewStateWrite.then(enqueue) : enqueue();
    this.viewStateWrite = write;
    void write.then(() => {
      if (this.viewStateWrite === write) this.viewStateWrite = undefined;
      const remaining = (this.queuedViewStateWrites.get(pendingKey) ?? 1) - 1;
      if (remaining > 0) this.queuedViewStateWrites.set(pendingKey, remaining);
      else this.queuedViewStateWrites.delete(pendingKey);
    });
    return write;
  };

  private rememberViewState = (viewKey: string, state: DataViewState): void => {
    runInAction(() => {
      this.viewStateWriteSeq += 1;
      this.viewStateWrites.set(viewKey, this.viewStateWriteSeq);

      if (viewKey === ALL_VIEW_KEY) {
        this.allViewState = state;
        return;
      }

      this.views = this.views.map((view) => (view.id === viewKey ? { ...view, state } : view));
    });
  };

  private restoreViewStateWrittenDuringRequest = (
    writeSeq: number,
    localAllState: DataViewState,
    localViews: DataViewChipDto[],
  ): void => {
    for (const [viewKey, seq] of this.viewStateWrites) {
      if (seq <= writeSeq) continue;

      if (viewKey === ALL_VIEW_KEY) {
        this.allViewState = localAllState;
        continue;
      }

      const local = localViews.find((view) => view.id === viewKey);
      if (local) this.views = this.views.map((view) => (view.id === viewKey ? { ...view, state: local.state } : view));
    }
  };

  private resetPaginationPage = () => {
    if (!this.pagination) return;
    if (this.pagination.page === 1) return;
    this.pagination = { ...this.pagination, page: 1 };
  };
}
