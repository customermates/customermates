import type { BaseDataViewStore, HasId } from "@/core/base/base-data-view.store";
import type { BaseFormStore } from "@/core/base/base-form.store";
import type { Filter, FilterableField } from "@/core/base/base-get.schema";
import type { RootStore } from "@/core/stores/root.store";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BaseModalStore } from "@/core/base/base-modal.store";
import { FilterOperatorKey } from "@/core/base/base-query-builder";
import { Resource } from "@/generated/prisma";

import { FILTER_AUTO_APPLY_DELAY_MS, FilterPaletteStore } from "../filter-palette.store";

const FILTERABLE_FIELDS: FilterableField[] = [
  { field: "name", operators: [FilterOperatorKey.contains, FilterOperatorKey.equals] },
  { field: "status", operators: [FilterOperatorKey.in, FilterOperatorKey.notIn] },
];

class ResourceScopedStore extends BaseModalStore<{ draft: { value: unknown } }> {
  constructor(rootStore: RootStore) {
    super(rootStore, { draft: { value: undefined } }, Resource.contacts);
  }
}

function rootStore() {
  return {
    registerModalStore: vi.fn(),
    localeStore: { getTranslation: (key: string) => key },
    userStore: {
      user: { id: "user-1" },
      can: () => false,
      canAccess: () => false,
      canManage: () => false,
    },
  };
}

function tableStore(filters: Filter[] = []) {
  const table = {
    customColumns: [],
    filterableFields: FILTERABLE_FIELDS,
    filters,
    p13nId: "contacts",
    setQueryOptions: vi.fn((args: { filters?: Filter[] }) => {
      if (args.filters) table.filters = args.filters;
    }),
  };

  return table;
}

function openedOn(root: ReturnType<typeof rootStore>, table: ReturnType<typeof tableStore>) {
  const store = new FilterPaletteStore(root as unknown as RootStore);
  store.openFor(table as unknown as BaseDataViewStore<HasId>);

  return store;
}

describe("filter palette store contract", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("declares no resource, so filtering stays live for a user who cannot manage the surface", () => {
    const root = rootStore();
    const store = openedOn(root, tableStore());

    expect(store.resource).toBeUndefined();
    expect(store.isReadOnly).toBe(false);
    expect(store.isDisabled).toBe(false);
    expect(new ResourceScopedStore(root as unknown as RootStore).isDisabled).toBe(true);
  });

  it("declares the whole draft shape, so writing a value is never a silent no-op", () => {
    const store = openedOn(rootStore(), tableStore());
    store.pickField("name");

    expect(Object.keys(store.form.draft).sort()).toEqual(["field", "operator", "value"]);

    store.onChange("draft.value", "acme");

    expect(store.getValue("draft.value")).toBe("acme");

    store.onChange("absentBranch.value", "acme");

    expect(store.getValue("absentBranch.value")).toBeUndefined();
  });

  it("resets the baseline after a commit so no unsaved-changes guard survives an ordinary edit", () => {
    const table = tableStore();
    const store = openedOn(rootStore(), table);

    store.pickField("name");
    store.onChange("draft.value", "acme");

    expect(store.hasUnsavedChanges).toBe(true);

    vi.advanceTimersByTime(FILTER_AUTO_APPLY_DELAY_MS);

    expect(table.setQueryOptions).toHaveBeenCalledTimes(1);
    expect(store.hasUnsavedChanges).toBe(false);
  });

  it("leaves no unsaved-changes guard behind when a draft is abandoned without committing", () => {
    const table = tableStore();
    const store = openedOn(rootStore(), table);

    store.pickField("name");
    store.onChange("draft.value", "");
    vi.advanceTimersByTime(FILTER_AUTO_APPLY_DELAY_MS);

    expect(table.setQueryOptions).not.toHaveBeenCalled();
    expect(store.hasUnsavedChanges).toBe(false);
  });

  it("defines flushPendingChanges, which the reused inputs call optionally", () => {
    const store: BaseFormStore = openedOn(rootStore(), tableStore());

    expect(store.flushPendingChanges).toBeTypeOf("function");
  });

  it("registers itself with the root store so a route change drops a stale page stack", () => {
    const root = rootStore();
    const store = new FilterPaletteStore(root as unknown as RootStore);

    expect(root.registerModalStore).toHaveBeenCalledWith(store);
  });

  it("starts every surface on the root page, with no page left over from the last one", () => {
    const store = openedOn(rootStore(), tableStore());

    store.pickField("status");

    expect(store.page).toEqual({ kind: "value", field: "status" });

    store.openFor(tableStore() as unknown as BaseDataViewStore<HasId>);

    expect(store.page).toEqual({ kind: "root" });
    expect(store.pendingIndex).toBeUndefined();
    expect(store.form.draft).toEqual({ field: "", operator: undefined, value: undefined });
  });

  it("seeds a value page from the filter it was deep linked to", () => {
    const table = tableStore([{ field: "status", operator: FilterOperatorKey.notIn, value: ["open"] } as Filter]);
    const store = openedOn(rootStore(), table);

    store.openAt(table as unknown as BaseDataViewStore<HasId>, { kind: "value", field: "status", editIndex: 0 });

    expect(store.page).toEqual({ kind: "value", field: "status", editIndex: 0 });
    expect(store.form.draft).toEqual({ field: "status", operator: FilterOperatorKey.notIn, value: ["open"] });
    expect(store.pendingIndex).toBe(0);
  });

  it("drops a value the next operator cannot carry when a date page changes shape", () => {
    const table = tableStore([{ field: "createdAt", operator: FilterOperatorKey.inLastDays, value: 7 } as Filter]);
    const store = openedOn(rootStore(), table);

    store.openAt(table as unknown as BaseDataViewStore<HasId>, { kind: "value", field: "createdAt", editIndex: 0 });
    store.pushDateInput(FilterOperatorKey.between);

    expect(store.page).toEqual({
      kind: "dateInput",
      field: "createdAt",
      operator: FilterOperatorKey.between,
      editIndex: 0,
    });
    expect(store.form.draft.value).toBeUndefined();
  });
});
