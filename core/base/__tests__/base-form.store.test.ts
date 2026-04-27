import { describe, it, expect } from "vitest";

import type { RootStore } from "@/core/stores/root.store";

import { BaseFormStore } from "../base-form.store";

class TestStore<T extends object> extends BaseFormStore<T> {}

const stubRootStore = {} as unknown as RootStore;

describe("BaseFormStore.onChange", () => {
  it("sets a top-level property", () => {
    const store = new TestStore(stubRootStore, { name: "" });
    store.onChange("name", "Acme");
    expect(store.form.name).toBe("Acme");
  });

  it("sets a nested array+property path like 'filters[2].value'", () => {
    const store = new TestStore(stubRootStore, {
      filters: [{ field: "a" }, { field: "b" }, { field: "c", operator: "contains" }],
    });
    store.onChange("filters[2].value", "hello");
    expect(store.form.filters[2]).toEqual({ field: "c", operator: "contains", value: "hello" });
  });

  it("creates the leaf property when it doesn't exist (the original typing bug)", () => {
    // Mirrors the original repro: filter is initialized as { field, operator } only — no `value` key.
    const store = new TestStore<{ filters: Array<Record<string, string>> }>(stubRootStore, {
      filters: [{ field: "emails", operator: "contains" }],
    });
    expect("value" in store.form.filters[0]).toBe(false);

    store.onChange("filters[0].value", "x");
    expect(store.form.filters[0].value).toBe("x");
  });

  it("flips hasUnsavedChanges from false to true after an edit", () => {
    const store = new TestStore(stubRootStore, { name: "" });
    expect(store.hasUnsavedChanges).toBe(false);
    store.onChange("name", "Acme");
    expect(store.hasUnsavedChanges).toBe(true);
  });

  it("returns to clean after onInitOrRefresh re-syncs savedState", () => {
    const store = new TestStore(stubRootStore, { name: "" });
    store.onChange("name", "Acme");
    expect(store.hasUnsavedChanges).toBe(true);

    store.onInitOrRefresh({ name: "Acme" });
    expect(store.hasUnsavedChanges).toBe(false);
  });

  it("does nothing when the parent path doesn't exist", () => {
    const store = new TestStore<{ a: { b?: string } }>(stubRootStore, { a: {} });
    store.onChange("zzz.does.not.exist", "x");
    // No throw, and original form is untouched.
    expect(store.form).toEqual({ a: {} });
  });
});
