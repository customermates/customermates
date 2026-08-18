import { describe, expect, it, vi } from "vitest";

import type { RootStore } from "@/core/stores/root.store";

import { ViewMode } from "@/core/base/base-query-builder";
import { AgentUiControlStore } from "../ui-control.store";
import { resolveGroupByColumn, resolveSortColumn, toFilters, type AgentDataViewStore } from "../agent-view-ops";
import { resolveFormField, type AgentFormStore } from "../agent-form-ops";

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

function fakeFormStore(form: Record<string, unknown>, overrides: Record<string, unknown> = {}) {
  const store = {
    form,
    savedState: structuredClone(form),
    hasUnsavedChanges: false,
    getValue: (path: string) => {
      const match = /^customFieldValues\[(\d+)\]\.value$/.exec(path);
      if (match) return (form.customFieldValues as { value: unknown }[])[Number(match[1])]?.value;
      return form[path];
    },
    onChange: vi.fn(),
    customColumns: [],
    ...overrides,
  };
  return store as unknown as AgentFormStore;
}

describe("agent form operations", () => {
  it("resolves a field by path or label and coerces booleans and numbers", () => {
    const store = fakeFormStore({ firstName: "", newsletter: false, seats: 3 });

    expect(resolveFormField(store, "firstName", "Anna")).toEqual({ ok: true, path: "firstName", value: "Anna" });
    expect(resolveFormField(store, "newsletter", "yes")).toEqual({ ok: true, path: "newsletter", value: true });
    expect(resolveFormField(store, "seats", "12")).toEqual({ ok: true, path: "seats", value: 12 });
  });

  it("resolves a custom column by label and maps select option labels to stored values", () => {
    const store = fakeFormStore(
      { customFieldValues: [{ value: "" }] },
      {
        customColumns: [
          {
            id: "col-1",
            label: "Status",
            type: "singleSelect",
            options: { options: [{ value: "opt-open", label: "Open" }] },
          },
        ],
      },
    );

    expect(resolveFormField(store, "Status", "Open")).toEqual({
      ok: true,
      path: "customFieldValues[0].value",
      value: "opt-open",
    });
    expect(resolveFormField(store, "Status", "Closed")).toMatchObject({
      ok: false,
      message: '"Closed" is not an option for "Status". Options: Open.',
    });
  });

  it("names the available fields when asked for one that does not exist", () => {
    const store = fakeFormStore({ firstName: "", lastName: "" });

    expect(resolveFormField(store, "nickname", "x")).toMatchObject({
      ok: false,
      message: 'No field named "nickname" on this form. Fields: firstName, lastName.',
    });
  });
});

function controlStoreWith(rootOverrides: Record<string, unknown>) {
  const root = {
    navigationGuard: { isRegistered: () => true },
    ...rootOverrides,
  } as unknown as RootStore;
  return { store: new AgentUiControlStore(root), root };
}

describe("AgentUiControlStore.fillForm", () => {
  const baseForm = () => ({ firstName: "", lastName: "" });

  function formStore(overrides: Record<string, unknown> = {}) {
    const form = baseForm();
    return {
      form,
      hasUnsavedChanges: false,
      getValue: (path: string) => (form as Record<string, unknown>)[path],
      onChange: vi.fn((path: string, value: unknown) => {
        (form as Record<string, unknown>)[path] = value;
      }),
      customColumns: [],
      ...overrides,
    };
  }

  it("refuses when the form is not mounted", async () => {
    const target = formStore();
    const { store } = controlStoreWith({
      contactDetailStore: target,
      navigationGuard: { isRegistered: () => false },
    });

    const outcome = await store.fillForm({ form: "contact", fields: [{ field: "firstName", value: "Anna" }] });

    expect(outcome.ok).toBe(false);
    expect(target.onChange).not.toHaveBeenCalled();
  });

  it("refuses a form carrying the user's own unsaved edits without touching it", async () => {
    const target = formStore({ hasUnsavedChanges: true });
    const { store } = controlStoreWith({ contactDetailStore: target });

    const outcome = await store.fillForm({ form: "contact", fields: [{ field: "firstName", value: "Anna" }] });

    expect(outcome).toMatchObject({
      ok: false,
      result:
        "This form has unsaved changes made by the user. Never overwrite them - ask the user to save or discard first.",
    });
    expect(target.onChange).not.toHaveBeenCalled();
  });

  it("fills a pristine form, allows its own second pass, and refuses after a user edit", async () => {
    const target = formStore();
    const { store } = controlStoreWith({ contactDetailStore: target });

    const first = await store.fillForm({ form: "contact", fields: [{ field: "firstName", value: "Anna" }] });
    expect(first.ok).toBe(true);
    expect(target.onChange).toHaveBeenCalledWith("firstName", "Anna");

    target.hasUnsavedChanges = true;
    const second = await store.fillForm({ form: "contact", fields: [{ field: "lastName", value: "Schmidt" }] });
    expect(second.ok).toBe(true);

    (target.form as Record<string, unknown>).firstName = "USER EDIT";
    const third = await store.fillForm({ form: "contact", fields: [{ field: "lastName", value: "Other" }] });
    expect(third.ok).toBe(false);
    expect(target.onChange).toHaveBeenCalledTimes(2);
  });

  it("submits only when asked and reports a validation failure", async () => {
    const submit = vi.fn().mockResolvedValue(undefined);
    const target = formStore({ onSubmit: submit, error: undefined });
    const { store } = controlStoreWith({ contactDetailStore: target });

    const outcome = await store.fillForm({
      form: "contact",
      fields: [{ field: "firstName", value: "Anna" }],
      submit: true,
    });

    expect(submit).toHaveBeenCalledTimes(1);
    expect(outcome.ok).toBe(true);
    expect(outcome.result).toContain("saved the form");
  });
});

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
