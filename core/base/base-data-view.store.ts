import type { ObservableSet } from "mobx";
import type { RootStore } from "../stores/root.store";
import type { Filter, FilterableField, GroupValueSums, PaginationRequest, SortDescriptor } from "./base-get.schema";
import type { GetResult } from "./base-get.interactor";
import type { GetQueryParams } from "@/core/base/base-get.schema";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { DataViewChipDto, DataViewState } from "@/core/data-view/data-view-state.schema";
import type { DataViewSurfaceKey } from "@/core/data-view/data-view-keys";
import type { GroupPageRequest, Grouping, GroupingResult } from "@/core/base/grouping/grouping.schema";
import type { GroupableFieldDto } from "@/core/base/grouping/groupable-field";

import { makeObservable, observable, computed, action, toJS, runInAction } from "mobx";
import deepEqual from "fast-deep-equal/es6";
import { Action, CustomColumnType } from "@/generated/prisma";

import type { Resource, EntityType } from "@/generated/prisma";

import { toastZodErrorTree } from "../utils/toast-zod-error-tree";
import { reportApplicationError } from "../errors/report-application-error";

import { ViewMode } from "./base-query-builder";
import { BaseStore } from "./base.store";

import { GROUP_PAGE_SIZE_DEFAULT, encodeGroupingToken, sameGrouping } from "@/core/base/grouping/grouping.schema";
import {
  applyDataViewOverrideAction,
  selectDataViewAction,
  getCustomColumnsByEntityTypeAction,
  bulkDeleteEntitiesAction,
  bulkUpdateCustomFieldValuesAction,
  updateEntityCustomFieldValueAction,
} from "@/app/actions";
import { ALL_VIEW_KEY } from "@/core/data-view/data-view-keys";

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
  views: DataViewChipDto[] = [];
  activeViewKey: string = ALL_VIEW_KEY;
  viewIsDirty = false;
  viewIsOwner = false;
  viewCanShare = false;
  viewPersistable = true;
  viewUnavailable = false;
  viewLost = false;
  viewMode: ViewMode = ViewMode.table;
  grouping?: Grouping | null;
  groupingResult?: GroupingResult;
  groupableFields: GroupableFieldDto[] = [];
  collapsedGroupKeys: ObservableSet<string> = observable.set();
  selectedIds: ObservableSet<string> = observable.set();
  selectedScopeKey: string | undefined = undefined;

  groupCounts: Record<string, number> = {};
  groupValueSums: Record<string, GroupValueSums> = {};
  groupedTakeOverrides: Record<string, number> = {};
  isBulkMutating = false;

  public readonly resource?: Resource;
  public readonly entityType?: EntityType;

  private persistViewStateTimer?: number;
  private pendingGroupOnly?: string;
  private overrideWrites = 0;
  private requestGeneration = 0;
  private backgroundRefreshRunning = false;
  private backgroundRefreshQueued = false;
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
      views: observable,
      activeViewKey: observable,
      viewIsDirty: observable,
      viewIsOwner: observable,
      viewCanShare: observable,
      viewPersistable: observable,
      viewUnavailable: observable,
      viewLost: observable,
      viewMode: observable,
      grouping: observable,
      groupingResult: observable.ref,
      groupableFields: observable,
      collapsedGroupKeys: observable,
      selectedIds: observable,
      selectedScopeKey: observable,

      groupCounts: observable,
      groupValueSums: observable,
      groupedTakeOverrides: observable,
      isBulkMutating: observable,

      orderedColumns: computed,
      visibleColumns: computed,
      sortableColumnIds: computed,
      canManage: computed,
      canExport: computed,
      canUpdateSelection: computed,
      canDeleteSelection: computed,
      isDisabled: computed,
      hasSelection: computed,
      selectedCount: computed,
      selectedVisibleCount: computed,
      selectedOffViewCount: computed,
      isSelectionAtLimit: computed,
      currentSelectionScopeKey: computed,
      isSelectionScopeStale: computed,
      massEditableCustomColumns: computed,
      isKanbanMode: computed,
      isGrouped: computed,
      groupingKey: computed,
      groupingColumnId: computed,
      currentGroupableFieldId: computed,

      setViewOptions: action,
      setQueryOptions: action,
      removeFilter: action,
      applyView: action,
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
      toggleItemSelection: action,
      setPageSelection: action,
      keepSelectionInView: action,
      clearSelection: action,
      loadMoreInGroup: action,
      toggleGroupCollapsed: action,
      setGroupSelection: action,
      resetGroupedTakeOverrides: action,
      transferItemBetweenGroups: action,
      transferItemBetweenResultGroups: action,
      restoreGroupValueSums: action,
      restoreResultGroups: action,
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

  bulkDelete = async (): Promise<boolean> => {
    const ids = Array.from(this.selectedIds);
    if (ids.length === 0 || !this.entityType) return false;
    if (ids.length > MAX_SELECTION_SIZE) {
      this.toastError("MassActions.limitReached", { values: { limit: MAX_SELECTION_SIZE } });
      return false;
    }

    this.setBulkMutating(true);
    try {
      const res = await bulkDeleteEntitiesAction({ entityType: this.entityType, ids });
      if (res && !res.ok) {
        toastZodErrorTree(res.error);
        await this.refresh();
        return false;
      }
      this.rootStore.activityTimelines.refreshForMany(this.entityType, ids);
      this.clearSelection();
      await this.refresh();
      return true;
    } finally {
      this.setBulkMutating(false);
    }
  };

  bulkUpdateCustomField = async (columnId: string, value: string): Promise<boolean> => {
    const entityIds = Array.from(this.selectedIds);
    if (entityIds.length === 0 || !this.entityType) return false;
    if (entityIds.length > MAX_SELECTION_SIZE) {
      this.toastError("MassActions.limitReached", { values: { limit: MAX_SELECTION_SIZE } });
      return false;
    }

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
    fromGroupKey: string;
    toGroupKey: string;
    value: string | null;
    destinationValueSums?: GroupValueSums;
  }): Promise<void> => {
    const entityType = this.entityType;
    if (!entityType) return;

    const columnId = this.groupingResult?.columnId;

    if (!columnId || !this.groupingResult?.supportsDragWriteBack) {
      this.toastError("Common.notifications.unexpectedError");
      return;
    }

    const summedFields = [
      ...new Set([
        ...Object.values(this.groupValueSums).flatMap((sums) => Object.keys(sums)),
        ...(this.groupingResult?.groups ?? []).flatMap((group) => Object.keys(group.valueSums ?? {})),
      ]),
    ];
    const itemValueSums = readItemValueSums(params.item, summedFields);
    const valueSumsBeforeMove = this.groupValueSums;
    const resultGroupsBeforeMove = this.groupingResult;

    this.upsertItemLocal(params.optimisticItem);
    this.transferItemBetweenGroups(params.fromGroupKey, params.toGroupKey, itemValueSums, params.destinationValueSums);
    this.transferItemBetweenResultGroups({
      itemId: params.item.id,
      fromGroupKey: params.fromGroupKey,
      toGroupKey: params.toGroupKey,
      itemValueSums,
      destinationValueSums: params.destinationValueSums,
    });

    const valueSumsAfterMove = this.groupValueSums;
    const resultGroupsAfterMove = this.groupingResult;

    const revert = () => {
      this.upsertItemLocal(params.item);
      this.transferItemBetweenGroups(params.toGroupKey, params.fromGroupKey);
      this.restoreGroupValueSums(valueSumsBeforeMove, valueSumsAfterMove);
      this.restoreResultGroups(resultGroupsBeforeMove, resultGroupsAfterMove);
    };

    try {
      const res = await updateEntityCustomFieldValueAction({
        entityType,
        entityId: params.item.id,
        customFieldValues: [{ columnId, value: params.value }],
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
    return this.viewMode === ViewMode.card && Boolean(this.grouping);
  }

  get isGrouped(): boolean {
    return Boolean(this.grouping && this.groupingResult);
  }

  get groupingKey(): string {
    return this.grouping ? encodeGroupingToken(this.grouping) : "";
  }

  get groupingColumnId(): string | undefined {
    return this.groupingResult?.columnId;
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

    return this.rootStore.userStore.canManage(this.resource);
  }

  get canExport(): boolean {
    if (!this.resource) return false;

    return this.rootStore.userStore.canAccess(this.resource);
  }

  get canUpdateSelection(): boolean {
    if (!this.resource) return true;

    return this.rootStore.userStore.can(this.resource, Action.update);
  }

  get canDeleteSelection(): boolean {
    if (!this.resource) return true;

    return this.rootStore.userStore.can(this.resource, Action.delete);
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

  get selectedVisibleCount(): number {
    return this.items.reduce((count, item) => (this.selectedIds.has(item.id) ? count + 1 : count), 0);
  }

  get selectedOffViewCount(): number {
    return this.selectedCount - this.selectedVisibleCount;
  }

  get isSelectionAtLimit(): boolean {
    return this.selectedIds.size >= MAX_SELECTION_SIZE;
  }

  get currentSelectionScopeKey(): string {
    return JSON.stringify({ filters: toJS(this.filters) ?? null, searchTerm: this.searchTerm ?? null });
  }

  get isSelectionScopeStale(): boolean {
    if (!this.hasSelection || this.selectedScopeKey === undefined) return false;

    return this.selectedScopeKey !== this.currentSelectionScopeKey;
  }

  get massEditableCustomColumns(): CustomColumnDto[] {
    return this.customColumns.filter((col) =>
      col.type === CustomColumnType.singleSelect ? col.options.options.length > 0 : true,
    );
  }

  isItemSelectable(_item: Entity): boolean {
    return true;
  }

  setSelectedIds = (keys: Set<string>) => {
    this.selectedIds.clear();
    this.selectedScopeKey = undefined;
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
      this.toastError("MassActions.limitReached", { values: { limit: MAX_SELECTION_SIZE } });
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

    if (missing.length > room) this.toastError("MassActions.limitReached", { values: { limit: MAX_SELECTION_SIZE } });
  };

  keepSelectionInView = (): void => {
    const visible = new Set(this.items.map((item) => item.id));
    for (const id of [...this.selectedIds]) if (!visible.has(id)) this.selectedIds.delete(id);
    this.selectedScopeKey = this.selectedIds.size > 0 ? this.currentSelectionScopeKey : undefined;
  };

  clearSelection = () => {
    this.selectedIds.clear();
    this.selectedScopeKey = undefined;
  };

  private rememberSelectionScope(): void {
    if (this.selectedIds.size === 0) {
      this.selectedScopeKey = undefined;
      return;
    }

    if (this.selectedScopeKey === undefined) this.selectedScopeKey = this.currentSelectionScopeKey;
  }

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

  get visibleColumns(): TableColumn[] {
    const hidden = new Set(this.hiddenColumns);
    return this.orderedColumns.filter((column) => !hidden.has(column.uid));
  }

  setItems(args: GetResult<Entity>): void {
    if (args.grouping?.partial) {
      this.mergeGroupPage(args);
      return;
    }

    const previousViewKey = this.activeViewKey;

    this.requestGeneration += 1;
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
    this.columnOrder = (args.columnOrder ?? []).filter((uid) => uid !== "name");
    this.viewMode = args.viewMode ?? ViewMode.table;
    this.grouping = args.grouping?.grouping ?? null;
    this.groupingResult = args.grouping;
    this.groupableFields = args.groupableFields ?? [];
    this.views = args.views ?? [];
    this.activeViewKey = args.activeViewKey ?? ALL_VIEW_KEY;
    this.viewIsDirty = args.viewIsDirty ?? false;
    this.viewIsOwner = args.viewIsOwner ?? false;
    this.viewCanShare = args.viewCanShare ?? false;
    this.viewPersistable = args.viewPersistable ?? true;
    this.viewUnavailable = args.viewUnavailable ?? false;
    this.viewLost = this.viewUnavailable && previousViewKey !== ALL_VIEW_KEY;
    this.groupCounts = args.groupCounts ?? {};
    this.groupValueSums = args.groupValueSums ?? {};
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
        group.key === page.key ? { ...group, itemIds: page.itemIds, hasMore: page.hasMore, materialised: true } : group,
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

    if (missing.length > room) this.toastError("MassActions.limitReached", { values: { limit: MAX_SELECTION_SIZE } });
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

  transferItemBetweenResultGroups = (args: {
    itemId: string;
    fromGroupKey: string;
    toGroupKey: string;
    itemValueSums?: GroupValueSums;
    destinationValueSums?: GroupValueSums;
  }): void => {
    const current = this.groupingResult;
    if (!current || args.fromGroupKey === args.toGroupKey) return;

    const creditedSums = args.destinationValueSums ?? args.itemValueSums;

    this.groupingResult = {
      ...current,
      groups: current.groups.map((group) => {
        if (group.key === args.fromGroupKey) {
          return {
            ...group,
            count: Math.max(0, group.count - 1),
            itemIds: group.itemIds.filter((id) => id !== args.itemId),
            ...(group.valueSums && args.itemValueSums
              ? { valueSums: shiftValueSums(group.valueSums, args.itemValueSums, -1) }
              : {}),
          };
        }

        if (group.key === args.toGroupKey) {
          return {
            ...group,
            count: group.count + 1,
            itemIds: group.itemIds.includes(args.itemId) ? group.itemIds : [args.itemId, ...group.itemIds],
            ...(group.valueSums && creditedSums ? { valueSums: shiftValueSums(group.valueSums, creditedSums, 1) } : {}),
          };
        }

        return group;
      }),
    };
  };

  restoreResultGroups = (snapshot: GroupingResult | undefined, expected: GroupingResult | undefined): void => {
    if (this.groupingResult !== expected) return;
    this.groupingResult = snapshot;
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
    grouping?: Grouping | null;
  }) => {
    let hasChanges = false;
    const groupingBefore = this.groupingKey;

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

  removeFilter = (filter: Filter) => {
    const newFilters = (this.filters ?? []).filter((f) => f.field !== filter.field);

    this.setQueryOptions({
      filters: newFilters,
    });
  };

  applyView = (viewKey: string): void => {
    const chip = this.views.find((view) => view.id === viewKey);
    const key = chip ? chip.id : ALL_VIEW_KEY;
    const state: DataViewState = chip?.state ?? {};

    runInAction(() => {
      this.activeViewKey = key;
      this.filters = this.withKnownFields(state.filters);
      this.searchTerm = state.searchTerm;
      this.sortDescriptor = state.sortDescriptor ?? undefined;
      this.viewMode = state.viewMode ?? ViewMode.table;
      this.grouping = state.grouping ?? null;
      this.columnOrder = (state.columnOrder ?? []).filter((uid) => uid !== "name");
      this.columnWidths = state.columnWidths ?? {};
      this.hiddenColumns = (state.hiddenColumns ?? []).filter((uid) => uid !== "name");
      this.pagination = this.pagination ? { ...this.pagination, page: 1 } : this.pagination;
      this.groupedTakeOverrides = {};
      this.collapsedGroupKeys.clear();
      this.viewIsDirty = false;
      this.viewLost = false;
    });

    if (this.p13nId && this.viewPersistable) {
      void selectDataViewAction({ surfaceKey: this.p13nId as DataViewSurfaceKey, viewKey: key }).catch(
        reportApplicationError,
      );
    }

    this.refreshResolvedInBackground();
  };

  resetView = async (): Promise<void> => {
    if (!this.p13nId || !this.viewPersistable) return;

    this.cancelPendingPersist();
    const viewKey = this.activeViewKey;
    const result = await applyDataViewOverrideAction({
      surfaceKey: this.p13nId as DataViewSurfaceKey,
      viewKey,
      mode: "reset",
    });
    if (result.ok && this.activeViewKey === viewKey) this.setViewIsDirty(result.data.hasOverride);
    this.refreshResolvedInBackground();
  };

  private setViewIsDirty = (isDirty: boolean): void => {
    runInAction(() => {
      this.overrideWrites += 1;
      this.viewIsDirty = isDirty;
    });
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

  private executeRefresh = async (
    mode: DataViewRefreshMode,
    shouldCommit?: () => boolean,
    resolveFromServer = false,
  ): Promise<void> => {
    const generation = ++this.requestGeneration;
    const overrideWritesAtStart = this.overrideWrites;
    const wasInitialized = this.isReady;
    const groupPage = this.buildGroupPageRequest();
    const params: GetQueryParams = resolveFromServer
      ? {
          p13nId: this.p13nId,
          viewId: this.activeViewKey === ALL_VIEW_KEY ? ALL_VIEW_KEY : this.activeViewKey,
        }
      : {
          p13nId: this.p13nId,
          viewId: this.activeViewKey === ALL_VIEW_KEY ? undefined : this.activeViewKey,
          filters: toJS(this.filters),
          searchTerm: toJS(this.searchTerm),
          sortDescriptor: toJS(this.sortDescriptor),
          ...(groupPage
            ? { groupPage, pageSize: this.pagination?.pageSize }
            : {
                pagination: this.pagination
                  ? { page: this.pagination.page, pageSize: this.pagination.pageSize }
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
      const dirtyBeforeResult = this.viewIsDirty;
      this.setItems(result);
      if (this.overrideWrites !== overrideWritesAtStart) this.viewIsDirty = dirtyBeforeResult;
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
      includeValueSums: this.viewMode === ViewMode.card,
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

  private refreshResolvedInBackground = (): void => {
    void this.executeRefresh("background", undefined, true).catch(() => undefined);
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

  protected refreshAction(_params?: GetQueryParams): Promise<GetResult<Entity>> {
    return Promise.reject(new Error("refreshAction must be implemented by entity stores"));
  }

  private cancelPendingPersist = () => {
    if (this.persistViewStateTimer === undefined) return;

    clearTimeout(this.persistViewStateTimer);
    this.persistViewStateTimer = undefined;
  };

  private persistViewState = () => {
    if (!this.p13nId || !this.viewPersistable) return;

    this.cancelPendingPersist();

    this.persistViewStateTimer = window.setTimeout(() => {
      this.persistViewStateTimer = undefined;
      const viewKey = this.activeViewKey;
      void applyDataViewOverrideAction({
        surfaceKey: this.p13nId as DataViewSurfaceKey,
        viewKey,
        mode: "save",
        state: {
          filters: toJS(this.filters) ?? [],
          searchTerm: this.searchTerm ?? "",
          sortDescriptor: toJS(this.sortDescriptor) ?? null,
          pageSize: this.pagination?.pageSize,
          viewMode: toJS(this.viewMode),
          grouping: toJS(this.grouping) ?? null,
          columnOrder: toJS(this.columnOrder),
          columnWidths: toJS(this.columnWidths),
          hiddenColumns: toJS(this.hiddenColumns),
        },
      })
        .then((res) => {
          if (!res.ok) {
            toastZodErrorTree(res.error);
            return;
          }
          if (this.activeViewKey === viewKey) this.setViewIsDirty(res.data.hasOverride);
        })
        .catch(reportApplicationError);
    }, 1000);
  };

  private resetPaginationPage = () => {
    if (!this.pagination) return;
    if (this.pagination.page === 1) return;
    this.pagination = { ...this.pagination, page: 1 };
  };
}
