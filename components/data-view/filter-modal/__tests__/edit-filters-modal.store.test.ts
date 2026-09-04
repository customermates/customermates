import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

import type { BaseDataViewStore, HasId } from "@/core/base/base-data-view.store";
import type { RootStore } from "@/core/stores/root.store";
import type { Filter, FilterableField } from "@/core/base/base-get.schema";

const { deleteDataViewAction, upsertDataViewAction } = vi.hoisted(() => ({
  deleteDataViewAction: vi.fn(),
  upsertDataViewAction: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/app/actions", () => ({ deleteDataViewAction, upsertDataViewAction }));

import { EditFiltersModalStore, FILTER_AUTO_APPLY_DELAY_MS } from "../edit-filters-modal.store";

import { ActivityFiltersSchema } from "@/ee/messaging/activities/activities.schema";

type SavedView = { id: string; name: string; state: { filters: unknown } };

const FILTERABLE_FIELDS: FilterableField[] = [
  { field: "name", operators: ["contains", "equals", "isNull"] },
  { field: "userIds", operators: ["in", "notIn", "hasSome", "hasNone"] },
  { field: "contactIds", operators: ["in", "notIn", "hasSome", "hasNone"] },
] as unknown as FilterableField[];

const A_CONTACT = "60000000-0000-4000-8000-000000000008";

function tableStore(overrides: { filters?: Filter[]; views?: SavedView[] } = {}) {
  return {
    customColumns: [],
    filterableFields: FILTERABLE_FIELDS,
    filters: overrides.filters ?? [],
    p13nId: "contacts",
    setQueryOptions: vi.fn(),
    views: overrides.views ?? [],
  };
}

function modalStore() {
  const root = { registerModalStore: vi.fn(), localeStore: { getTranslation: (key: string) => key } };
  return new EditFiltersModalStore(root as unknown as RootStore);
}

function openedOn(table: ReturnType<typeof tableStore>) {
  const store = modalStore();
  store.openFor(table as unknown as BaseDataViewStore<HasId>);
  return store;
}

function committedFilters(table: ReturnType<typeof tableStore>, call = 0) {
  return table.setQueryOptions.mock.calls[call]?.[0];
}

describe("EditFiltersModalStore auto-apply", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    upsertDataViewAction.mockReset();
    deleteDataViewAction.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("commits a typed edit once, in the background, after the debounce elapses", () => {
    const table = tableStore();
    const store = openedOn(table);

    store.onChange("filters[0].operator", "contains");
    store.onChange("filters[0].value", "a");
    store.onChange("filters[0].value", "ac");
    store.onChange("filters[0].value", "acme");

    expect(table.setQueryOptions).not.toHaveBeenCalled();

    vi.advanceTimersByTime(FILTER_AUTO_APPLY_DELAY_MS);

    expect(table.setQueryOptions).toHaveBeenCalledTimes(1);
    expect(committedFilters(table)).toEqual({
      filters: [{ field: "name", operator: "contains", value: "acme" }],
      refreshMode: "background",
    });
  });

  it("does not commit a typed edit before the debounce elapses", () => {
    const table = tableStore();
    const store = openedOn(table);

    store.onChange("filters[0].value", "acme");
    vi.advanceTimersByTime(FILTER_AUTO_APPLY_DELAY_MS - 1);

    expect(table.setQueryOptions).not.toHaveBeenCalled();
  });

  it("applies an operator change immediately through the flush the inputs call", () => {
    const table = tableStore();
    const store = openedOn(table);

    store.onChange("filters[0].operator", "isNull");
    store.flushPendingChanges();

    expect(table.setQueryOptions).toHaveBeenCalledTimes(1);
    expect(committedFilters(table)).toEqual({
      filters: [{ field: "name", operator: "isNull", value: undefined }],
      refreshMode: "background",
    });

    vi.advanceTimersByTime(FILTER_AUTO_APPLY_DELAY_MS);
    expect(table.setQueryOptions).toHaveBeenCalledTimes(1);
  });

  it("keeps incomplete configurations out of the committed query", () => {
    const table = tableStore();
    const store = openedOn(table);

    store.onChange("filters[0].operator", "contains");
    store.onChange("filters[1].operator", "in");
    store.onChange("filters[1].value", []);
    vi.advanceTimersByTime(FILTER_AUTO_APPLY_DELAY_MS);

    expect(committedFilters(table)).toEqual({ filters: [], refreshMode: "background" });
  });

  it("drops a filter from the query when its value is cleared", () => {
    const table = tableStore({ filters: [{ field: "name", operator: "contains", value: "acme" } as Filter] });
    const store = openedOn(table);

    store.onChange("filters[0].value", "");
    vi.advanceTimersByTime(FILTER_AUTO_APPLY_DELAY_MS);

    expect(committedFilters(table)).toEqual({ filters: [], refreshMode: "background" });
  });

  it("leaves no unsaved-changes guard behind after an ordinary auto-apply", () => {
    const table = tableStore();
    const store = openedOn(table);

    store.onChange("filters[0].operator", "contains");
    store.onChange("filters[0].value", "acme");
    expect(store.hasUnsavedChanges).toBe(true);

    vi.advanceTimersByTime(FILTER_AUTO_APPLY_DELAY_MS);

    expect(store.hasUnsavedChanges).toBe(false);
  });

  it("keeps unsaved named-preset edits guarded while still applying them", () => {
    const table = tableStore({
      views: [
        { id: "preset-1", name: "Mine", state: { filters: [{ field: "name", operator: "contains", value: "a" }] } },
      ],
    });
    const store = openedOn(table);

    store.onChange("presetId", "preset-1");
    expect(store.hasUnsavedChanges).toBe(false);

    store.onChange("filters[0].value", "b");
    vi.advanceTimersByTime(FILTER_AUTO_APPLY_DELAY_MS);

    expect(committedFilters(table, 1)).toEqual({
      filters: [{ field: "name", operator: "contains", value: "b" }],
      refreshMode: "background",
    });
    expect(store.hasUnsavedChanges).toBe(true);
  });

  it("applies a selected named preset immediately", () => {
    const table = tableStore({
      views: [
        { id: "preset-1", name: "Mine", state: { filters: [{ field: "name", operator: "contains", value: "acme" }] } },
      ],
    });
    const store = openedOn(table);

    store.onChange("presetId", "preset-1");

    expect(table.setQueryOptions).toHaveBeenCalledTimes(1);
    expect(committedFilters(table)).toEqual({
      filters: [{ field: "name", operator: "contains", value: "acme" }],
      refreshMode: "background",
    });
  });

  it("survives a stored view whose filters are not a usable array", () => {
    const table = tableStore({ views: [{ id: "preset-1", name: "Broken", state: { filters: null } }] });
    const store = openedOn(table);

    expect(() => store.onChange("presetId", "preset-1")).not.toThrow();
    expect(store.form.filters.map((filter) => filter.field)).toEqual(["name", "userIds", "contactIds"]);
    expect(committedFilters(table)).toEqual({ filters: [], refreshMode: "background" });
  });

  it("flushes a pending edit when the overlay is dismissed", () => {
    const table = tableStore();
    const store = openedOn(table);

    store.onChange("filters[0].operator", "contains");
    store.onChange("filters[0].value", "acme");
    store.close();

    expect(table.setQueryOptions).toHaveBeenCalledTimes(1);
    expect(committedFilters(table)).toEqual({
      filters: [{ field: "name", operator: "contains", value: "acme" }],
      refreshMode: "background",
    });
  });

  it("drops a pending edit when the filters are cleared", () => {
    const table = tableStore();
    const store = openedOn(table);

    store.onChange("filters[0].operator", "contains");
    store.onChange("filters[0].value", "acme");
    store.cancelPendingAutoApply();
    vi.advanceTimersByTime(FILTER_AUTO_APPLY_DELAY_MS);

    expect(table.setQueryOptions).not.toHaveBeenCalled();
  });

  it("keeps a relation-existence operator from carrying a value into the timeline schema", () => {
    const poisoned = { field: "contactIds", operator: "hasSome", value: [A_CONTACT] } as unknown as Filter;
    const table = tableStore({ filters: [poisoned] });
    const store = openedOn(table);

    store.onChange("filters[0].operator", "contains");
    store.onChange("filters[0].value", "acme");
    vi.advanceTimersByTime(FILTER_AUTO_APPLY_DELAY_MS);

    const committed = (committedFilters(table).filters as Filter[]).find((filter) => filter.field === "contactIds");

    expect(committed).toEqual({ field: "contactIds", operator: "hasSome" });
    expect("value" in (committed as object)).toBe(false);
    expect(() => ActivityFiltersSchema.parse([committed])).not.toThrow();
    expect(() => ActivityFiltersSchema.parse([poisoned])).toThrow();
  });

  it("never writes a preset when submitting outside preset mode", async () => {
    const table = tableStore();
    const store = openedOn(table);

    store.onChange("filters[0].operator", "contains");
    store.onChange("filters[0].value", "acme");
    await store.onSubmit();

    expect(upsertDataViewAction).not.toHaveBeenCalled();
    expect(store.isOpen).toBe(true);
    expect(committedFilters(table)).toEqual({
      filters: [{ field: "name", operator: "contains", value: "acme" }],
      refreshMode: "background",
    });
  });

  it("writes the preset and closes only on an explicit save", async () => {
    const table = tableStore();
    const store = openedOn(table);
    upsertDataViewAction.mockResolvedValue({ ok: true, data: {} });

    store.onChange("presetId", "new");
    store.onChange("name", "Hot leads");
    store.onChange("filters[0].operator", "contains");
    store.onChange("filters[0].value", "acme");
    await store.onSubmit();

    expect(upsertDataViewAction).toHaveBeenCalledWith({
      id: undefined,
      surfaceKey: "contacts",
      name: "Hot leads",
      state: { filters: [{ field: "name", operator: "contains", value: "acme" }] },
    });
    expect(store.isOpen).toBe(false);
  });
});
