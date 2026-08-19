import type { ObservableSet } from "mobx";
import type { RootStore } from "../stores/root.store";
import type { Filter, FilterableField, GroupValueSums, PaginationRequest, SortDescriptor } from "./base-get.schema";
import type { GetResult } from "./base-get.interactor";
import type { GetQueryParams, GroupedPaginationRequest } from "@/core/base/base-get.schema";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { SavedFilterPreset } from "@/features/p13n/prisma-p13n.repository";

import { makeObservable, observable, computed, action, toJS, runInAction } from "mobx";
import deepEqual from "fast-deep-equal/es6";
import { CustomColumnType } from "@/generated/prisma";

import type { Resource, EntityType } from "@/generated/prisma";

import { toastZodErrorTree } from "../utils/toast-zod-error-tree";

import { ViewMode } from "./base-query-builder";
import { BaseStore } from "./base.store";

import { KANBAN_PER_GROUP_DEFAULT } from "./base-get.schema";
import {
  upsertP13nAction,
  getCustomColumnsByEntityTypeAction,
  bulkDeleteEntitiesAction,
  bulkUpdateCustomFieldValuesAction,
  updateEntityCustomFieldValueAction,
} from "@/app/actions";

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

type DataViewRefreshMode = "background" | "visible";

function readItemValueSums(item: unknown, fields: readonly string[]): GroupValueSums | undefined {
  const values = item as Record<string, unknown>;
  const summed = fields.flatMap((field) =>
    typeof values[field] === "number" ? [[field, values[field]] as const] : [],
  );

  return summed.length > 0 ? Object.fromEntries(summed) : undefined;
}

function shiftValueSums(group: GroupValueSums, item: GroupValueSums, sign: 1 | -1): GroupValueSums {
  const fields = new Set([...Object.keys(group), ...Object.keys(item)]);

  return Object.fromEntries(
    [...fields].map((field) => [field, Math.max(0, (group[field] ?? 0) + sign * (item[field] ?? 0))]),
  );
}

export abstract class BaseDataViewStore<Entity extends HasId> extends BaseStore {
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
  selectedIds: ObservableSet<string> = observable.set();

  groupCounts: Record<string, number> = {};
  groupValueSums: Record<string, GroupValueSums> = {};
  groupedTakeOverrides: Record<string, number> = {};
  isBulkMutating = false;

  public readonly resource?: Resource;
  public readonly entityType?: EntityType;

  private persistViewOptionsTimer?: number;
  private requestGeneration = 0;
  private requestState: DataViewRequestState = { status: "uninitialized" };
  private onChangesCallbacks: (() => void | Promise<void>)[] = [];

  abstract get columnsDefinition(): TableColumn[];

  constructor(rootStore: RootStore, resource?: Resource, entityType?: EntityType) {
    super(rootStore);
    this.resource = resource;
    this.entityType = entityType;

    makeObservable<this, "requestState">(this, {
      requestState: observable.ref,
      dataRequest: computed,
      isRefreshing: computed,
      isReady: computed,

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
      selectedIds: observable,

      groupCounts: observable,
      groupValueSums: observable,
      groupedTakeOverrides: observable,
      isBulkMutating: observable,

      orderedColumns: computed,
      sortableColumnIds: computed,
      canManage: computed,
      isDisabled: computed,
      hasSelection: computed,
      selectedCount: computed,
      singleSelectCustomColumns: computed,
      isKanbanMode: computed,
      kanbanGroupingKey: computed,

      setViewOptions: action,
      setQueryOptions: action,
      removeFilter: action,
      changeFilterPreset: action,
      refresh: action,
      refreshCustomColumns: action,
      upsertItem: action,
      upsertItemLocal: action,
      removeItem: action,
      registerOnChange: action,
      setCustomColumns: action,
      executeOnChanges: action,
      setItems: action,
      setSelectedIds: action,
      clearSelection: action,
      loadMoreInGroup: action,
      resetGroupedTakeOverrides: action,
      transferItemBetweenGroups: action,
      restoreGroupValueSums: action,
      setBulkMutating: action,
      bulkDelete: action,
      bulkUpdateCustomField: action,
      updateCustomFieldValue: action,
      moveItemBetweenGroups: action,
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

  setBulkMutating = (next: boolean) => {
    this.isBulkMutating = next;
  };

  bulkDelete = async (): Promise<void> => {
    const ids = Array.from(this.selectedIds);
    if (ids.length === 0 || !this.entityType) return;

    this.setBulkMutating(true);
    try {
      const res = await bulkDeleteEntitiesAction({ entityType: this.entityType, ids });
      if (res && !res.ok) {
        const announced = toastZodErrorTree(res.error);
        await this.refresh();
        throw new Error(announced ? "" : this.t("Common.notifications.unexpectedError"));
      }
      this.rootStore.activityTimelines.refreshForMany(this.entityType, ids);
      this.clearSelection();
      await this.refresh();
    } finally {
      this.setBulkMutating(false);
    }
  };

  bulkUpdateCustomField = async (columnId: string, value: string): Promise<boolean> => {
    const entityIds = Array.from(this.selectedIds);
    if (entityIds.length === 0 || !this.entityType) return false;

    this.setBulkMutating(true);
    try {
      const res = await bulkUpdateCustomFieldValuesAction({
        entityType: this.entityType,
        entityIds,
        customFieldValues: [{ columnId, value }],
      });
      if (res && !res.ok) {
        if (!toastZodErrorTree(res.error)) this.toastError("Common.notifications.unexpectedError");
        await this.refresh();
        return false;
      }
      this.rootStore.activityTimelines.refreshForMany(this.entityType, entityIds);
      this.clearSelection();
      await this.refresh();
      this.toastSuccess("Common.notifications.updated");
      return true;
    } finally {
      this.setBulkMutating(false);
    }
  };

  updateCustomFieldValue = async (entityId: string, columnId: string, value: string | null): Promise<boolean> => {
    const entityType = this.entityType;
    if (!entityType) return false;

    const res = await updateEntityCustomFieldValueAction({
      entityType,
      entityId,
      customFieldValues: [{ columnId, value }],
    });
    if (res?.ok) {
      await this.upsertItem(res.data as unknown as Entity);
      return true;
    }
    toastZodErrorTree(res?.error);
    return false;
  };

  moveItemBetweenGroups = async (params: {
    item: Entity;
    optimisticItem: Entity;
    columnId: string;
    fromGroupKey: string;
    toGroupKey: string;
    value: string | null;
    destinationValueSums?: GroupValueSums;
  }): Promise<void> => {
    const entityType = this.entityType;
    if (!entityType) return;

    const groupingColumn = this.customColumns.find((column) => column.id === params.columnId);

    if (groupingColumn?.type !== CustomColumnType.singleSelect) {
      this.toastError("Common.notifications.unexpectedError");
      return;
    }

    const summedFields = [...new Set(Object.values(this.groupValueSums).flatMap((sums) => Object.keys(sums)))];
    const itemValueSums = readItemValueSums(params.item, summedFields);
    const valueSumsBeforeMove = this.groupValueSums;

    this.upsertItemLocal(params.optimisticItem);
    this.transferItemBetweenGroups(params.fromGroupKey, params.toGroupKey, itemValueSums, params.destinationValueSums);

    const valueSumsAfterMove = this.groupValueSums;

    const revert = () => {
      this.upsertItemLocal(params.item);
      this.transferItemBetweenGroups(params.toGroupKey, params.fromGroupKey);
      this.restoreGroupValueSums(valueSumsBeforeMove, valueSumsAfterMove);
    };

    try {
      const res = await updateEntityCustomFieldValueAction({
        entityType,
        entityId: params.item.id,
        customFieldValues: [{ columnId: params.columnId, value: params.value }],
      });
      if (res?.ok) await this.upsertItem(res.data as unknown as Entity);
      else {
        revert();
        toastZodErrorTree(res?.error);
      }
    } catch (err) {
      revert();
      throw err;
    }
  };

  get isKanbanMode(): boolean {
    return this.viewMode === ViewMode.card && Boolean(this.groupingColumnId);
  }

  get kanbanGroupingKey(): string {
    return this.isKanbanMode ? `${this.groupingColumnId}` : "";
  }

  get sortableColumnIds(): Set<string> {
    return new Set(this.columnsDefinition.filter((col) => col.sortable).map((col) => col.uid));
  }

  get canManage(): boolean {
    if (!this.resource) return true;

    return this.rootStore.userStore.canManage(this.resource);
  }

  get isDisabled(): boolean {
    if (!this.resource) return false;

    return !this.rootStore.userStore.canManage(this.resource);
  }

  get hasSelection(): boolean {
    return this.selectedIds.size > 0;
  }

  get selectedCount(): number {
    return this.selectedIds.size;
  }

  get singleSelectCustomColumns(): CustomColumnDto[] {
    return this.customColumns.filter((col) => col.type === CustomColumnType.singleSelect);
  }

  isItemSelectable(_item: Entity): boolean {
    return true;
  }

  setSelectedIds = (keys: "all" | Set<string>) => {
    this.selectedIds.clear();
    if (keys === "all") {
      for (const item of this.items) if (this.isItemSelectable(item)) this.selectedIds.add(item.id);
    } else keys.forEach((id) => this.selectedIds.add(id));
  };

  clearSelection = () => {
    this.selectedIds.clear();
  };

  get orderedColumns() {
    const columnMap = new Map(this.columnsDefinition.map((col) => [col.uid, col]));
    const orderedUids = new Set(this.columnOrder);
    const nameColumn = this.columnsDefinition.find((col) => col.uid === "name");

    if (this.columnOrder.length > 0) {
      const columnsFromOrder = this.columnOrder
        .map((uid) => columnMap.get(uid))
        .filter((column): column is TableColumn => column !== undefined && column.uid !== "name");

      const columnsNotInOrder = this.columnsDefinition.filter((col) => !orderedUids.has(col.uid) && col.uid !== "name");

      const res: TableColumn[] = [];
      if (nameColumn) res.push(nameColumn);
      res.push(...columnsFromOrder, ...columnsNotInOrder);

      return res;
    }

    const remainingColumns = this.columnsDefinition.filter((col) => col.uid !== "name");

    const res: TableColumn[] = [];
    if (nameColumn) res.push(nameColumn);
    res.push(...remainingColumns);

    return res;
  }

  setItems(args: GetResult<Entity>): void {
    this.requestGeneration += 1;
    const wasReady = this.isReady;
    this.items = args.items;
    this.customColumns = args.customColumns ?? [];
    this.p13nId = args.p13nId;
    this.filterableFields = args.filterableFields || [];
    this.searchTerm = args.searchTerm;
    this.sortDescriptor = args.sortDescriptor;
    this.pagination = args.pagination;
    this.filters = this.withKnownFields(args.filters);
    this.columnWidths = args.columnWidths || {};
    this.hiddenColumns = (args.hiddenColumns ?? []).filter((uid) => uid !== "name");
    this.savedFilterPresets = args.savedFilterPresets;
    this.columnOrder = (args.columnOrder ?? []).filter((uid) => uid !== "name");
    if (!wasReady) {
      this.viewMode = args.viewMode ?? ViewMode.table;
      this.groupingColumnId = args.groupingColumnId;
    }
    this.groupCounts = args.groupCounts ?? {};
    this.groupValueSums = args.groupValueSums ?? {};
    this.requestState = { status: "ready" };
  }

  loadMoreInGroup = (groupKey: string): void => {
    const current = this.groupedTakeOverrides[groupKey] ?? KANBAN_PER_GROUP_DEFAULT;
    this.groupedTakeOverrides = {
      ...this.groupedTakeOverrides,
      [groupKey]: current + KANBAN_PER_GROUP_DEFAULT,
    };
    this.refreshQueryInBackground();
  };

  resetGroupedTakeOverrides = (): void => {
    if (Object.keys(this.groupedTakeOverrides).length === 0) return;
    this.groupedTakeOverrides = {};
  };

  transferItemBetweenGroups = (
    fromGroupKey: string,
    toGroupKey: string,
    itemValueSums?: GroupValueSums,
    destinationValueSums?: GroupValueSums,
  ): void => {
    if (fromGroupKey === toGroupKey) return;
    const fromCount = this.groupCounts[fromGroupKey] ?? 0;
    const toCount = this.groupCounts[toGroupKey] ?? 0;
    this.groupCounts = {
      ...this.groupCounts,
      [fromGroupKey]: Math.max(0, fromCount - 1),
      [toGroupKey]: toCount + 1,
    };

    const fromValueSums = this.groupValueSums[fromGroupKey];
    const toValueSums = this.groupValueSums[toGroupKey];
    if (!itemValueSums || !fromValueSums || !toValueSums) return;

    this.groupValueSums = {
      ...this.groupValueSums,
      [fromGroupKey]: shiftValueSums(fromValueSums, itemValueSums, -1),
      [toGroupKey]: shiftValueSums(toValueSums, destinationValueSums ?? itemValueSums, 1),
    };
  };

  restoreGroupValueSums = (
    snapshot: Record<string, GroupValueSums>,
    expected: Record<string, GroupValueSums>,
  ): void => {
    if (this.groupValueSums !== expected) return;
    this.groupValueSums = snapshot;
  };

  setViewOptions = (updates: {
    columnOrder?: string[];
    columnWidth?: { uid: string; width: number };
    columnWidths?: Record<string, number>;
    hiddenColumns?: string[];
    viewMode?: ViewMode;
    groupingColumnId?: string;
  }) => {
    let hasChanges = false;
    const groupingBefore = this.kanbanGroupingKey;

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
      hasChanges = true;
    }

    const groupingChanged = groupingBefore !== this.kanbanGroupingKey;
    if (groupingChanged) this.resetGroupedTakeOverrides();

    if (hasChanges) this.persistViewOptions();
    if (groupingChanged) this.refreshQueryInBackground();
  };

  setQueryOptions = (updates: {
    filters?: Filter[];
    pagination?: PaginationRequest;
    sortDescriptor?: SortDescriptor | undefined;
    searchTerm?: string;
    forceRefresh?: boolean;
  }) => {
    let hasChanges = false;
    let queryShapeChanged = false;

    if (updates.filters !== undefined && !deepEqual(this.filters, updates.filters)) {
      this.filters = updates.filters;
      hasChanges = true;
      queryShapeChanged = true;
    }

    if (updates.pagination) {
      const newPagination: PaginationRequest = this.pagination
        ? { ...this.pagination, ...updates.pagination }
        : {
            page: updates.pagination.page,
            pageSize: updates.pagination.pageSize,
          };

      if (!deepEqual(this.pagination, newPagination)) {
        this.pagination = newPagination;
        hasChanges = true;
      }
    }

    if ("sortDescriptor" in updates && !deepEqual(this.sortDescriptor, updates.sortDescriptor)) {
      this.sortDescriptor = updates.sortDescriptor;
      hasChanges = true;
      queryShapeChanged = true;
    }

    if (updates.searchTerm !== undefined && (this.searchTerm || undefined) !== (updates.searchTerm || undefined)) {
      this.searchTerm = updates.searchTerm;
      hasChanges = true;
      queryShapeChanged = true;
    }

    if (queryShapeChanged) {
      this.resetPaginationPage();
      this.resetGroupedTakeOverrides();
    }

    if (hasChanges || updates.forceRefresh) this.refreshQueryInBackground();
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
      if (preset) this.setQueryOptions({ filters: this.withKnownFields(preset.filters) });
    } else this.setQueryOptions({ filters: [] });
  };

  private withKnownFields(filters: Filter[] | undefined): Filter[] {
    const list = filters ?? [];
    if (this.filterableFields.length === 0) return list;
    const known = new Set(this.filterableFields.map((f) => f.field));
    return list.filter((f) => known.has(f.field));
  }

  refreshCustomColumns = async (): Promise<void> => {
    if (!this.entityType) return;

    const customColumns = await getCustomColumnsByEntityTypeAction({
      entityType: this.entityType,
    });

    this.setCustomColumns(customColumns);
  };

  refresh = (): Promise<void> => this.executeRefresh("background");

  protected refreshGuarded = (shouldCommit: () => boolean): Promise<void> =>
    this.executeRefresh("background", shouldCommit);

  private executeRefresh = async (mode: DataViewRefreshMode, shouldCommit?: () => boolean): Promise<void> => {
    const generation = ++this.requestGeneration;
    const wasInitialized = this.isReady;
    const groupedPagination = this.buildGroupedPaginationRequest();
    const params: GetQueryParams = {
      p13nId: this.p13nId,
      filters: toJS(this.filters),
      searchTerm: toJS(this.searchTerm),
      sortDescriptor: toJS(this.sortDescriptor),
      pagination: this.pagination ? { page: this.pagination.page, pageSize: this.pagination.pageSize } : undefined,
      groupedPagination,
      viewMode: this.viewMode,
      groupingColumnId: this.groupingColumnId ?? undefined,
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

    runInAction(() => this.setItems(result));
  };

  private buildGroupedPaginationRequest(): GroupedPaginationRequest | undefined {
    if (!this.isKanbanMode || !this.groupingColumnId) return undefined;

    const groupingColumn = this.customColumns.find((c) => c.id === this.groupingColumnId);
    if (!groupingColumn || groupingColumn.type !== CustomColumnType.singleSelect) return undefined;

    const overrides = Object.keys(this.groupedTakeOverrides).length > 0 ? toJS(this.groupedTakeOverrides) : undefined;

    return {
      groupingColumnId: this.groupingColumnId,
      perGroup: KANBAN_PER_GROUP_DEFAULT,
      overrides,
    };
  }

  upsertItem = async (target: Entity): Promise<void> => {
    this.upsertItemLocal(target);
    this.requestGeneration += 1;
    if (this.requestState.status !== "uninitialized") this.requestState = { status: "ready" };
    if (this.entityType) this.rootStore.activityTimelines.refreshForMany(this.entityType, [target.id]);
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

    this.items = items;
    this.requestGeneration += 1;
    if (this.requestState.status !== "uninitialized") this.requestState = { status: "ready" };
    if (this.entityType) this.rootStore.activityTimelines.refreshForMany(this.entityType, [targetId]);
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

  protected refreshAction(_params?: GetQueryParams): Promise<GetResult<Entity>> {
    return Promise.reject(new Error("refreshAction must be implemented by entity stores"));
  }

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
      }).then((res) => {
        if (!res.ok) toastZodErrorTree(res.error);
      });
    }, 1000);
  };

  private resetPaginationPage = () => {
    if (!this.pagination) return;
    if (this.pagination.page === 1) return;
    this.pagination = { ...this.pagination, page: 1 };
  };
}
