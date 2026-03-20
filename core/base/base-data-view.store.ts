import type { IReactionDisposer } from "mobx";
import type { RootStore } from "../stores/root.store";
import type { Filter, FilterableField, PaginationRequest, SortDescriptor } from "./base-get.schema";
import type { GetResult } from "./base-get.interactor";
import type { GetQueryParams } from "@/core/base/base-get.schema";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { SavedFilterPreset } from "@/features/p13n/prisma-p13n.repository";

import { makeObservable, observable, computed, action, toJS, runInAction, reaction } from "mobx";
import deepEqual from "fast-deep-equal/es6";

import { Action } from "@/generated/prisma";
import type { Resource, EntityType } from "@/generated/prisma";

import { decodeGetParams, encodeGetParams } from "../utils/get-params";

import { ViewMode } from "./base-query-builder";

import { upsertP13nAction, getCustomColumnsByEntityTypeAction } from "@/app/actions";

export interface HasId {
  id: string;
}

export type XTableColumn = {
  uid: string;
  sortable?: boolean;
  label?: string;
  width?: number;
};

export abstract class BaseDataViewStore<Entity extends HasId> {
  isRefreshing = false;
  isReady = false;

  items: Entity[] = [];
  customColumns: CustomColumnDto[] = [];

  searchTerm: string | undefined;
  pagination: (PaginationRequest & { totalPages?: number; total?: number }) | undefined;
  sortDescriptor: SortDescriptor | undefined;
  filters: Filter[] | undefined = undefined;
  filterableFields: FilterableField[] = [];

  p13nId?: string;
  columnOrder: string[] = [];
  columnWidths: Record<string, number> = {};
  hiddenColumns: string[] = [];
  savedFilterPresets?: SavedFilterPreset[] = undefined;
  viewMode: ViewMode = ViewMode.table;
  groupingColumnId?: string | null;

  public readonly resource?: Resource;
  public readonly rootStore?: RootStore;
  public readonly entityType?: EntityType;

  private persistViewOptionsTimer?: number;
  private urlSyncDisposer?: IReactionDisposer;
  private onChangesCallbacks: (() => void | Promise<void>)[] = [];
  private urlSyncUpdateTimer?: number;

  abstract get columnsDefinition(): XTableColumn[];

  constructor(rootStore: RootStore, resource?: Resource, entityType?: EntityType) {
    this.rootStore = rootStore;
    this.resource = resource;
    this.entityType = entityType;

    makeObservable(this, {
      isRefreshing: observable,
      isReady: observable,

      items: observable,
      customColumns: observable,

      searchTerm: observable,
      filters: observable,
      filterableFields: observable,
      pagination: observable,
      sortDescriptor: observable,

      p13nId: observable,
      hiddenColumns: observable,
      columnOrder: observable,
      columnWidths: observable,
      savedFilterPresets: observable,
      viewMode: observable,
      groupingColumnId: observable,

      orderedColumns: computed,
      headerColumns: computed,
      visibleColumnsCount: computed,
      activePresetId: computed,
      canReadAll: computed,
      canAccess: computed,
      canManage: computed,
      isDisabled: computed,

      setViewOptions: action,
      setQueryOptions: action,
      removeFilter: action,
      changeFilterPreset: action,
      refresh: action,
      refreshCustomColumns: action,
      upsertItem: action,
      removeItem: action,
      registerOnChange: action,
      setCustomColumns: action,
      executeOnChanges: action,
      setItems: action,
    });
  }

  get visibleColumnsCount() {
    const hiddenSet = new Set(this.hiddenColumns);

    return this.columnsDefinition.filter((col) => !hiddenSet.has(col.uid)).length;
  }

  get canReadAll(): boolean {
    if (!this.resource || !this.rootStore) return true;

    return this.rootStore.userStore.can(this.resource, Action.readAll);
  }

  get canAccess(): boolean {
    if (!this.resource || !this.rootStore) return true;

    return this.rootStore.userStore.canAccess(this.resource);
  }

  get canManage(): boolean {
    if (!this.resource || !this.rootStore) return true;

    return this.rootStore.userStore.canManage(this.resource);
  }

  get isDisabled(): boolean {
    if (!this.resource || !this.rootStore) return false;

    return !this.rootStore.userStore.canManage(this.resource);
  }

  get activePresetId(): string | undefined {
    if (!this.savedFilterPresets) return undefined;

    const currentFilters = this.filters;
    const matchingPreset = this.savedFilterPresets.find((preset) => deepEqual(preset.filters, currentFilters));

    return matchingPreset?.id;
  }

  get orderedColumns() {
    const columnMap = new Map(this.columnsDefinition.map((col) => [col.uid, col]));
    const orderedUids = new Set(this.columnOrder);
    const nameColumn = this.columnsDefinition.find((col) => col.uid === "name");

    if (this.columnOrder.length > 0) {
      const columnsFromOrder = this.columnOrder
        .map((uid) => columnMap.get(uid))
        .filter((column): column is XTableColumn => column !== undefined && column.uid !== "name");

      const columnsNotInOrder = this.columnsDefinition.filter((col) => !orderedUids.has(col.uid) && col.uid !== "name");

      const res: XTableColumn[] = [];
      if (nameColumn) res.push(nameColumn);
      res.push(...columnsFromOrder, ...columnsNotInOrder);

      return res;
    }

    const remainingColumns = this.columnsDefinition.filter((col) => col.uid !== "name");

    const res: XTableColumn[] = [];
    if (nameColumn) res.push(nameColumn);
    res.push(...remainingColumns);

    return res;
  }

  get headerColumns() {
    const hiddenSet = new Set(this.hiddenColumns);

    return this.orderedColumns.filter((column) => !hiddenSet.has(column.uid));
  }

  setItems(args: GetResult<Entity>): void {
    this.items = args.items;
    this.customColumns = args.customColumns ?? [];
    this.p13nId = args.p13nId;
    this.filterableFields = args.filterableFields || [];
    this.searchTerm = args.searchTerm;
    this.sortDescriptor = args.sortDescriptor;
    this.pagination = args.pagination;
    this.filters = args.filters || [];
    this.columnWidths = args.columnWidths || {};
    this.hiddenColumns = (args.hiddenColumns ?? []).filter((uid) => uid !== "name");
    this.savedFilterPresets = args.savedFilterPresets;
    this.columnOrder = (args.columnOrder ?? []).filter((uid) => uid !== "name");
    this.viewMode = args.viewMode ?? ViewMode.table;
    this.groupingColumnId = args.groupingColumnId;

    this.isReady = true;
  }

  setViewOptions = (updates: {
    columnOrder?: string[];
    columnWidth?: { uid: string; width: number };
    columnWidths?: Record<string, number>;
    hiddenColumns?: string[];
    viewMode?: ViewMode;
    groupingColumnId?: string;
  }) => {
    let hasChanges = false;

    if (updates.columnOrder) {
      const newColumnOrder = updates.columnOrder.filter((uid) => uid !== "name");

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
      const filteredHiddenColumns = updates.hiddenColumns.filter((uid) => uid !== "name");
      if (!deepEqual(this.hiddenColumns, filteredHiddenColumns)) {
        this.hiddenColumns = filteredHiddenColumns;
        hasChanges = true;
      }
    }

    if ("viewMode" in updates && this.viewMode !== updates.viewMode) {
      this.viewMode = updates.viewMode ?? ViewMode.table;
      hasChanges = true;
    }

    if ("groupingColumnId" in updates && this.groupingColumnId !== updates.groupingColumnId) {
      this.groupingColumnId = updates.groupingColumnId ?? null;
      if (updates.groupingColumnId) this.pagination = { page: 1, pageSize: 1000 };

      hasChanges = true;
    }

    if (hasChanges) this.persistViewOptions();
  };

  setQueryOptions = (updates: {
    filters?: Filter[];
    pagination?: PaginationRequest;
    sortDescriptor?: SortDescriptor | undefined;
    searchTerm?: string;
    forceRefresh?: boolean;
  }) => {
    let hasChanges = false;

    if (updates.filters !== undefined && !deepEqual(this.filters, updates.filters)) {
      this.filters = updates.filters;
      this.resetPaginationPage();
      hasChanges = true;
    }

    if (updates.pagination) {
      const newPagination: PaginationRequest = this.pagination
        ? { ...this.pagination, ...updates.pagination }
        : { page: updates.pagination.page, pageSize: updates.pagination.pageSize };

      if (!deepEqual(this.pagination, newPagination)) {
        this.pagination = newPagination;
        hasChanges = true;
      }
    }

    if (updates.sortDescriptor !== undefined && !deepEqual(this.sortDescriptor, updates.sortDescriptor)) {
      this.sortDescriptor = updates.sortDescriptor;
      this.resetPaginationPage();
      hasChanges = true;
    }

    if (updates.searchTerm !== undefined && (this.searchTerm || undefined) !== (updates.searchTerm || undefined)) {
      this.searchTerm = updates.searchTerm;
      this.resetPaginationPage();
      hasChanges = true;
    }

    if (hasChanges || updates.forceRefresh) void this.persistQueryOptions();
  };

  removeFilter = (filter: Filter) => {
    const newFilters = (this.filters ?? []).filter((f) => f.field !== filter.field);

    this.setQueryOptions({
      filters: newFilters,
    });
  };

  changeFilterPreset = (presetId: string | undefined) => {
    if (presetId) {
      const preset = this.savedFilterPresets?.find((p) => p.id === presetId);
      if (preset) this.setQueryOptions({ filters: preset.filters });
    } else this.setQueryOptions({ filters: [] });
  };

  refreshCustomColumns = async (): Promise<void> => {
    if (!this.entityType) return;

    const customColumns = await getCustomColumnsByEntityTypeAction({ entityType: this.entityType });

    this.setCustomColumns(customColumns);
  };

  refresh = async (): Promise<void> => {
    const res = await this.refreshAction({
      p13nId: this.p13nId,
      filters: toJS(this.filters),
      searchTerm: toJS(this.searchTerm),
      sortDescriptor: toJS(this.sortDescriptor),
      pagination: this.pagination ? { page: this.pagination.page, pageSize: this.pagination.pageSize } : undefined,
    });

    this.setItems(res);
  };

  upsertItem = async (target: Entity): Promise<void> => {
    let items: Entity[] = [];
    const targetId = target.id;

    const existingIndex = this.items.findIndex(({ id: sourceId }) => sourceId === targetId);

    if (existingIndex >= 0) items = this.items.map((source) => (source.id === targetId ? target : source));
    else items = [...this.items, target];

    this.items = items;
    await this.executeOnChanges();
  };

  removeItem = async (targetId: string): Promise<void> => {
    const items = this.items.filter(({ id: sourceId }) => sourceId !== targetId);

    this.items = items;
    await this.executeOnChanges();
  };

  registerOnChange = (callback: () => void | Promise<void>): (() => void) => {
    this.onChangesCallbacks.push(callback);

    return () => {
      const index = this.onChangesCallbacks.indexOf(callback);
      if (index > -1) this.onChangesCallbacks.splice(index, 1);
    };
  };

  setCustomColumns = (customColumns: CustomColumnDto[]) => {
    this.customColumns = customColumns;
  };

  executeOnChanges = async () => {
    const promises = this.onChangesCallbacks.map((callback) => callback());

    await Promise.all(promises);
  };

  async persistQueryOptions(): Promise<void> {
    if (!this.isReady) return;

    runInAction(() => (this.isRefreshing = true));
    this.rootStore?.loadingOverlayStore.setIsLoading(true);

    try {
      await this.refresh();
    } finally {
      runInAction(() => (this.isRefreshing = false));
      this.rootStore?.loadingOverlayStore.setIsLoading(false);
    }
  }

  withUrlSync = (): (() => void) => {
    this.setUrlSyncEnabled(true);
    return () => this.setUrlSyncEnabled(false);
  };

  protected refreshAction(_params?: GetQueryParams): Promise<GetResult<Entity>> {
    return Promise.reject(new Error("refreshAction must be implemented by entity stores"));
  }

  private setUrlSyncEnabled = (enabled: boolean) => {
    if (enabled) {
      this.setupUrlSync();
      return;
    }
    if (this.urlSyncDisposer) {
      this.urlSyncDisposer();
      this.urlSyncDisposer = undefined;
    }
    if (this.urlSyncUpdateTimer) {
      clearTimeout(this.urlSyncUpdateTimer);
      this.urlSyncUpdateTimer = undefined;
    }
  };

  private persistViewOptions = () => {
    if (!this.p13nId) return;

    if (this.persistViewOptionsTimer) clearTimeout(this.persistViewOptionsTimer);

    this.persistViewOptionsTimer = window.setTimeout(() => {
      void upsertP13nAction({
        p13nId: this.p13nId as string,
        columnOrder: toJS(this.columnOrder),
        columnWidths: toJS(this.columnWidths),
        hiddenColumns: toJS(this.hiddenColumns),
        viewMode: toJS(this.viewMode),
        groupingColumnId: this.groupingColumnId,
      });
    }, 1000);
  };

  private setupUrlSync = () => {
    if (this.urlSyncDisposer) {
      this.urlSyncDisposer();
      this.urlSyncDisposer = undefined;
    }

    if (this.urlSyncUpdateTimer) {
      clearTimeout(this.urlSyncUpdateTimer);
      this.urlSyncUpdateTimer = undefined;
    }

    this.urlSyncDisposer = reaction(
      () => ({
        filters: toJS(this.filters),
        searchTerm: this.searchTerm,
        sortDescriptor: toJS(this.sortDescriptor),
        page: this.pagination?.page ?? 1,
        pageSize: this.pagination?.pageSize ?? 25,
        isRefreshing: this.isRefreshing,
      }),
      () => {
        if (this.isRefreshing) return;

        if (this.urlSyncUpdateTimer) clearTimeout(this.urlSyncUpdateTimer);

        this.urlSyncUpdateTimer = window.setTimeout(() => {
          const currentSearch = window.location.search.slice(1);

          const doesNotNeedUrlUpdate = !this.needsUrlUpdate(currentSearch);

          if (doesNotNeedUrlUpdate) return;

          const currentPathname = window.location.pathname;
          const newUrl = this.buildUrl(currentPathname);
          window.history.replaceState(null, "", newUrl);
        }, 100);
      },
    );
  };

  private getQueryString(): string {
    return encodeGetParams({
      filters: this.filters,
      searchTerm: this.searchTerm,
      sortDescriptor: this.sortDescriptor,
      pagination: this.pagination
        ? { page: this.pagination.page, pageSize: this.pagination.pageSize }
        : { page: 1, pageSize: 25 },
    }).toString();
  }

  private needsUrlUpdate(currentSearch: string): boolean {
    const raw = currentSearch.startsWith("?") ? currentSearch.slice(1) : currentSearch;
    let normalizedSearch = raw;
    try {
      normalizedSearch = encodeGetParams(decodeGetParams(new URLSearchParams(raw))).toString();
    } catch {}
    return normalizedSearch !== this.getQueryString();
  }

  private buildUrl(pathname: string): string {
    const qs = this.getQueryString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  private resetPaginationPage = () => {
    if (!this.pagination) return;
    if (this.pagination.page === 1) return;
    this.pagination = { ...this.pagination, page: 1 };
  };
}
