import { recordInvariant } from "@/features/records/record-invariant";
import { describe, expect, it, vi } from "vitest";
import type { RootStore } from "@/core/stores/root.store";
import { createCrmPreset, presetId } from "@/features/records/crm-preset";
vi.mock("../../../records/actions", () => ({
  applyRecordConfigurationAction: vi.fn(),
  previewRecordConfigurationAction: vi.fn(),
}));
import { TypeModalStore } from "../type-modal";
const company = "6487f9fb-7b10-439a-b783-9d3da8184b14";
const id = (key: string) => presetId(company, key);
const root = { registerModalStore: vi.fn(), localeStore: { locale: "en" } } as unknown as RootStore;

describe("list configuration", () => {
  it("suggests the plural name from the name until the plural is edited", () => {
    const model = createCrmPreset(company);
    const store = new TypeModalStore(root, model, vi.fn());
    store.edit(model, null);
    store.renameList("Project");
    expect(store.form.pluralName).toBe("Projects");
    store.onChange("pluralName", "Programmes");
    store.renameList("Programme");
    expect(store.form.pluralName).toBe("Programmes");
    store.onChange("pluralName", "");
    store.renameList("Initiative");
    expect(store.form.pluralName).toBe("Initiatives");
  });
  it("keeps a custom plural of an existing list when it is renamed", () => {
    const model = createCrmPreset(company);
    const store = new TypeModalStore(root, model, vi.fn());
    const deal = recordInvariant(model.types.find((type) => type.id === id("deal")));
    store.edit(model, { ...deal, label: "Deal", pluralLabel: "Pipeline" });
    store.renameList("Opportunity");
    expect(store.form.pluralName).toBe("Pipeline");
    store.edit(model, { ...deal, label: "Deal", pluralLabel: "Deals" });
    store.renameList("Opportunity");
    expect(store.form.pluralName).toBe("Opportunities");
  });
  it("leaves the Channels field out of list settings", () => {
    const model = createCrmPreset(company);
    const store = new TypeModalStore(root, model, vi.fn());
    store.edit(model, recordInvariant(model.types.find((type) => type.id === id("contact"))));
    store.onChange("description", "People we talk to");
    expect(store.operations().some((operation) => operation.operation === "putCapability")).toBe(false);
    store.edit(model, null);
    store.onChange("name", "Applicants");
    expect(store.operations().map((operation) => operation.operation)).toEqual(["createType"]);
  });
  it("does not rewrite channel configuration when appearance alone changes", () => {
    const model = createCrmPreset(company);
    const store = new TypeModalStore(root, model, vi.fn());
    store.edit(model, model.types[0], "appearance");
    store.onChange("layout", "board");
    expect(store.section).toBe("appearance");
    expect(store.operations().map((operation) => operation.operation)).toEqual(["putType"]);
  });
  it("saves a dragged field order with the General settings and resets it with the form", () => {
    const model = createCrmPreset(company);
    const deal = recordInvariant(model.types.find((type) => type.id === id("deal")));
    const store = new TypeModalStore(root, model, vi.fn());
    store.edit(model, deal);
    const order = store.form.fieldOrder;
    expect(order).toEqual(model.fields.filter((field) => field.typeId === deal.id).map((field) => field.id));
    expect(store.operations().map((operation) => operation.operation)).toEqual(["putType"]);
    store.moveField(order[1], order[0]);
    store.onChange("name", "Opportunity");
    expect(store.hasUnsavedChanges).toBe(true);
    const operations = store.operations();
    expect(operations[0]).toMatchObject({ operation: "putType", type: { id: deal.id, label: "Opportunity" } });
    expect(
      operations
        .slice(1)
        .map((operation) => operation.operation === "putField" && [operation.field.id, operation.field.position]),
    ).toEqual([
      [order[1], 0],
      [order[0], 1],
    ]);
    store.resetForm();
    expect(store.form.fieldOrder).toEqual(order);
    expect(store.operations().map((operation) => operation.operation)).toEqual(["putType"]);
  });
});
