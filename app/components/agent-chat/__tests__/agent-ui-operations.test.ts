import { describe, expect, it, vi } from "vitest";

import type { RootStore } from "@/core/stores/root.store";

import { ViewMode } from "@/core/base/base-query-builder";
import { AgentUiControlStore } from "../ui-control.store";
import { resolveGroupByColumn, resolveSortColumn, toFilters, type AgentDataViewStore } from "../agent-view-ops";

function fakeDataViewStore(overrides: Partial<AgentDataViewStore> = {}) {
  return {
    isReady: true,
    viewMode: ViewMode.table,
    groupingColumnId: undefined,
    customColumns: [],
    singleSelectCustomColumns: [],
    columnsDefinition: [
      { uid: "name", sortable: true, label: "Name" },
      { uid: "createdAt", sortable: true, label: "Created" },
      { uid: "avatar", sortable: false },
    ],
    filterableFields: [
      { field: "status", operators: ["equals", "in", "isNull"], label: "Status" },
      { field: "createdAt", operators: ["gt", "lt", "between", "inLastDays"], label: "Created" },
    ],
    setViewOptions: vi.fn(),
    setQueryOptions: vi.fn(),
    refreshQuery: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as AgentDataViewStore;
}

describe("agent view operations", () => {
  it("refuses kanban with a helpful message when no single-select column exists", () => {
    const resolution = resolveGroupByColumn(fakeDataViewStore(), "Status");

    expect(resolution).toMatchObject({
      ok: false,
      message: "Kanban needs a single-select custom field to group by; this view has none. Offer to create one.",
    });
  });

  it("resolves a grouping label case-insensitively to the column uuid and lists alternatives", () => {
    const store = fakeDataViewStore({
      singleSelectCustomColumns: [
        { id: "col-1", label: "Status", type: "singleSelect" },
        { id: "col-2", label: "Priority", type: "singleSelect" },
      ],
    } as never);

    expect(resolveGroupByColumn(store, "status")).toEqual({ ok: true, value: "col-1" });
    expect(resolveGroupByColumn(store, "Stage")).toMatchObject({
      ok: false,
      message: 'No single-select field named "Stage". Available: Status, Priority.',
    });
  });

  it("resolves sort columns by uid or label and rejects unsortable ones", () => {
    const store = fakeDataViewStore();

    expect(resolveSortColumn(store, "Created")).toEqual({ ok: true, value: "createdAt" });
    expect(resolveSortColumn(store, "name")).toEqual({ ok: true, value: "name" });
    expect(resolveSortColumn(store, "avatar")).toMatchObject({ ok: false });
  });

  it("reshapes flat filters into the typed union and validates operators per field", () => {
    const store = fakeDataViewStore();

    expect(toFilters(store, [{ field: "Status", operator: "in", values: ["open", "won"] }])).toEqual({
      ok: true,
      value: [{ field: "status", operator: "in", value: ["open", "won"] }],
    });
    expect(toFilters(store, [{ field: "createdAt", operator: "inLastDays", value: "7" }])).toEqual({
      ok: true,
      value: [{ field: "createdAt", operator: "inLastDays", value: 7 }],
    });
    expect(toFilters(store, [{ field: "status", operator: "gt", value: "x" }])).toMatchObject({ ok: false });
    expect(toFilters(store, [{ field: "missing", operator: "equals", value: "x" }])).toMatchObject({ ok: false });
    expect(toFilters(store, [{ field: "createdAt", operator: "between", values: ["a"] }])).toMatchObject({
      ok: false,
    });
  });
});

function controlStoreWith(rootOverrides: Record<string, unknown>) {
  const root = {
    ...rootOverrides,
  } as unknown as RootStore;
  return { store: new AgentUiControlStore(root), root };
}

describe("AgentUiControlStore.configureView", () => {
  it("keeps an explicit table layout even when the model also passes a grouping", async () => {
    const refreshQuery = vi.fn().mockResolvedValue(undefined);
    const dataStore = fakeDataViewStore({
      singleSelectCustomColumns: [{ id: "col-1", label: "Status", type: "singleSelect" }],
      refreshQuery,
    } as never);
    const { store } = controlStoreWith({ dealsStore: dataStore });
    Object.defineProperty(globalThis, "window", {
      value: { location: { pathname: "/en/deals" } },
      configurable: true,
    });

    const outcome = await store.configureView({ view: "deals", layout: "table", groupBy: "Status" });

    expect(outcome.ok).toBe(true);
    expect(dataStore.setViewOptions).toHaveBeenCalledTimes(1);
    expect(dataStore.setViewOptions).toHaveBeenCalledWith({ viewMode: "table" });
    expect(refreshQuery).toHaveBeenCalledTimes(1);
  });
});

describe("AgentUiControlStore.openRecord", () => {
  it("builds page and drawer paths and propagates a blocked navigation", async () => {
    const navigate = vi.fn().mockResolvedValue("navigated");
    const { store } = controlStoreWith({});
    store.registerNavigate(navigate);

    await store.openRecord({
      entity: "deal",
      recordId: "00000000-0000-4000-8000-000000000001",
      presentation: "page",
    });
    expect(navigate).toHaveBeenLastCalledWith("/deals/00000000-0000-4000-8000-000000000001");

    await store.openRecord({ entity: "contact", recordId: "new" });
    expect(navigate).toHaveBeenLastCalledWith("/contacts?open=contact:new");

    navigate.mockResolvedValue("blocked");
    const blocked = await store.openRecord({
      entity: "task",
      recordId: "00000000-0000-4000-8000-000000000002",
    });
    expect(blocked).toMatchObject({
      ok: false,
      result: "Navigation requires the user to resolve unsaved changes.",
    });
  });
});
