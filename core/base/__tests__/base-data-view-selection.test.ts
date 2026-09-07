import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Filter } from "../base-get.schema";
import type { GetResult } from "../base-get.interactor";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { RootStore } from "@/core/stores/root.store";

import { Action, CustomColumnType, EntityType, Resource } from "@/generated/prisma";

import { FilterOperatorKey } from "../base-query-builder";
import { BaseDataViewStore, MAX_SELECTION_SIZE } from "../base-data-view.store";

const { bulkDeleteEntitiesAction, bulkUpdateCustomFieldValuesAction, toastError } = vi.hoisted(() => ({
  bulkDeleteEntitiesAction: vi.fn(),
  bulkUpdateCustomFieldValuesAction: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    error: toastError,
    success: vi.fn(),
  },
}));

vi.mock("@/app/actions", () => ({
  bulkDeleteEntitiesAction,
  bulkUpdateCustomFieldValuesAction,
  getCustomColumnsByEntityTypeAction: vi.fn(),
  updateEntityCustomFieldValueAction: vi.fn(),
  upsertP13nAction: vi.fn(),
}));

type Item = { id: string; system?: boolean };

class TestStore extends BaseDataViewStore<Item> {
  get columnsDefinition() {
    return [];
  }

  protected refreshAction(): Promise<GetResult<Item>> {
    return Promise.resolve({ items: this.items });
  }

  override isItemSelectable(item: Item): boolean {
    return item.system !== true;
  }
}

function makeStore(allowed: Action[] = [Action.create, Action.update, Action.delete], resource?: Resource) {
  const granted = new Set(allowed);
  const rootStore = {
    localeStore: { getTranslation: (key: string) => key },
    activityTimelines: { refreshForMany: vi.fn() },
    userStore: {
      user: {},
      can: (_resource: Resource, action: Action) => granted.has(action),
      canManage: () => [Action.create, Action.update, Action.delete].every((action) => granted.has(action)),
    },
  } as unknown as RootStore;

  return new TestStore(rootStore, resource, EntityType.contact);
}

function page(ids: string[], extra: Partial<GetResult<Item>> = {}): GetResult<Item> {
  return { items: ids.map((id) => ({ id })), ...extra };
}

function singleSelectColumn(id: string, optionCount: number): CustomColumnDto {
  return {
    id,
    label: `single-${id}`,
    entityType: EntityType.contact,
    type: CustomColumnType.singleSelect,
    options: {
      options: Array.from({ length: optionCount }, (_, index) => ({
        value: `opt-${index}`,
        label: `Option ${index}`,
        color: "info" as const,
        isDefault: false,
        index,
      })),
    },
  } as CustomColumnDto;
}

function plainColumn(id: string): CustomColumnDto {
  return { id, label: `plain-${id}`, entityType: EntityType.contact, type: CustomColumnType.plain } as CustomColumnDto;
}

describe("data view selection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("adds the current page to the selection instead of replacing what was already selected", () => {
    const store = makeStore();
    store.setItems(page(["a", "b"]));
    store.setPageSelection(true);

    store.setItems(page(["c", "d"]));
    store.setPageSelection(true);

    expect([...store.selectedIds].sort()).toEqual(["a", "b", "c", "d"]);
  });

  it("unchecking the page header removes only that page from the selection", () => {
    const store = makeStore();
    store.setItems(page(["a", "b"]));
    store.setPageSelection(true);
    store.setItems(page(["c", "d"]));
    store.setPageSelection(true);

    store.setPageSelection(false);

    expect([...store.selectedIds].sort()).toEqual(["a", "b"]);
  });

  it("never selects a row the view marks unselectable", () => {
    const store = makeStore();
    store.setItems({ items: [{ id: "a" }, { id: "system", system: true }] });

    store.setPageSelection(true);

    expect([...store.selectedIds]).toEqual(["a"]);
  });

  it("stops the selection at the bulk write limit and says why", () => {
    const store = makeStore();
    const ids = Array.from({ length: MAX_SELECTION_SIZE + 5 }, (_, index) => `row-${index}`);
    store.setItems(page(ids));

    store.setPageSelection(true);

    expect(store.selectedCount).toBe(MAX_SELECTION_SIZE);
    expect(store.isSelectionAtLimit).toBe(true);
    expect(toastError).toHaveBeenCalledWith("MassActions.limitReached", expect.anything());
  });

  it("refuses one more row once the limit is reached", () => {
    const store = makeStore();
    store.setItems(page(Array.from({ length: MAX_SELECTION_SIZE }, (_, index) => `row-${index}`)));
    store.setPageSelection(true);
    toastError.mockClear();

    store.setItems(page(["extra"]));
    store.toggleItemSelection("extra");

    expect(store.selectedIds.has("extra")).toBe(false);
    expect(toastError).toHaveBeenCalledWith("MassActions.limitReached", expect.anything());
  });

  it("still allows deselecting while at the limit", () => {
    const store = makeStore();
    const ids = Array.from({ length: MAX_SELECTION_SIZE }, (_, index) => `row-${index}`);
    store.setItems(page(ids));
    store.setPageSelection(true);

    store.toggleItemSelection("row-0");

    expect(store.selectedIds.has("row-0")).toBe(false);
    expect(store.selectedCount).toBe(MAX_SELECTION_SIZE - 1);
  });

  it("counts selected rows that are no longer in the current view", () => {
    const store = makeStore();
    store.setItems(page(["a", "b"]));
    store.setPageSelection(true);

    store.setItems(page(["b", "c"]));

    expect(store.selectedCount).toBe(2);
    expect(store.selectedVisibleCount).toBe(1);
    expect(store.selectedOffViewCount).toBe(1);
  });

  it("marks the selection stale when the filters change under it", () => {
    const store = makeStore();
    const filters: Filter[] = [{ field: "stage", operator: FilterOperatorKey.contains, value: "won" }];
    store.setItems(page(["a"], { filters }));
    store.setPageSelection(true);

    expect(store.isSelectionScopeStale).toBe(false);

    store.setItems(page(["a"], { filters: [] }));

    expect(store.isSelectionScopeStale).toBe(true);
  });

  it("does not mark the selection stale when only the page changes", () => {
    const store = makeStore();
    store.setItems(page(["a"], { pagination: { page: 1, pageSize: 5, total: 2, totalPages: 2 } }));
    store.setPageSelection(true);

    store.setItems(page(["b"], { pagination: { page: 2, pageSize: 5, total: 2, totalPages: 2 } }));

    expect(store.isSelectionScopeStale).toBe(false);
  });

  it("keeps only the rows still in view and clears the stale marker", () => {
    const store = makeStore();
    store.setItems(page(["a", "b"], { searchTerm: "acme" }));
    store.setPageSelection(true);

    store.setItems(page(["b", "c"], { searchTerm: "other" }));
    expect(store.isSelectionScopeStale).toBe(true);

    store.keepSelectionInView();

    expect([...store.selectedIds]).toEqual(["b"]);
    expect(store.isSelectionScopeStale).toBe(false);
  });

  it("keeps the stale marker when a row is added under the changed filters", () => {
    const store = makeStore();
    store.setItems(page(["a", "b"], { searchTerm: "acme" }));
    store.setPageSelection(true);

    store.setItems(page(["c"], { searchTerm: "other" }));
    store.toggleItemSelection("c");

    expect(store.selectedCount).toBe(3);
    expect(store.isSelectionScopeStale).toBe(true);
  });

  it("re-baselines the scope once a fresh selection starts", () => {
    const store = makeStore();
    store.setItems(page(["a"], { searchTerm: "acme" }));
    store.setPageSelection(true);
    store.clearSelection();

    store.setItems(page(["b"], { searchTerm: "other" }));
    store.toggleItemSelection("b");

    expect(store.isSelectionScopeStale).toBe(false);
  });

  it("forgets the scope when the selection is cleared", () => {
    const store = makeStore();
    store.setItems(page(["a"], { searchTerm: "acme" }));
    store.setPageSelection(true);

    store.clearSelection();

    expect(store.selectedScopeKey).toBeUndefined();
    expect(store.isSelectionScopeStale).toBe(false);
  });

  it("refuses a bulk delete larger than the server limit without calling the server", async () => {
    const store = makeStore();
    for (let index = 0; index <= MAX_SELECTION_SIZE; index += 1) store.selectedIds.add(`row-${index}`);

    const result = await store.bulkDelete();

    expect(result).toBe(false);
    expect(bulkDeleteEntitiesAction).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledWith("MassActions.limitReached", expect.anything());
  });

  it("refuses a bulk field write larger than the server limit without calling the server", async () => {
    const store = makeStore();
    for (let index = 0; index <= MAX_SELECTION_SIZE; index += 1) store.selectedIds.add(`row-${index}`);

    const result = await store.bulkUpdateCustomField("column", "value");

    expect(result).toBe(false);
    expect(bulkUpdateCustomFieldValuesAction).not.toHaveBeenCalled();
  });

  it("gates each mass verb on the permission its own interactor enforces", () => {
    const readerOnly = makeStore([], Resource.contacts);
    const updaterOnly = makeStore([Action.update], Resource.contacts);
    const deleterOnly = makeStore([Action.delete], Resource.contacts);

    expect([readerOnly.canUpdateSelection, readerOnly.canDeleteSelection]).toEqual([false, false]);
    expect([updaterOnly.canUpdateSelection, updaterOnly.canDeleteSelection]).toEqual([true, false]);
    expect([deleterOnly.canUpdateSelection, deleterOnly.canDeleteSelection]).toEqual([false, true]);
  });

  it("leaves both mass verbs available on a view that declares no resource", () => {
    const store = makeStore([]);

    expect([store.canUpdateSelection, store.canDeleteSelection]).toEqual([true, true]);
  });

  it("offers every custom column type for mass editing but drops a single select with no options", () => {
    const store = makeStore();
    store.setCustomColumns([plainColumn("plain"), singleSelectColumn("empty", 0), singleSelectColumn("full", 2)]);

    expect(store.massEditableCustomColumns.map((column) => column.id)).toEqual(["plain", "full"]);
  });
});
