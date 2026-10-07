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
const root = { registerModalStore: vi.fn() } as unknown as RootStore;

describe("list configuration", () => {
  it("preserves channel binding identity, naming hints, and avatar setting on disable", () => {
    const model = createCrmPreset(company, "EUR");
    model.capabilities = model.capabilities.filter((binding) => binding.kind !== "channels");
    const binding = {
      id: id("identity"),
      typeId: id("contact"),
      kind: "channels" as const,
      enabled: true,
      providerAvatar: true,
      fields: [{ role: "firstName", fieldId: id("contact.firstName") }],
    };
    model.capabilities.push(binding);
    const store = new TypeModalStore(root, model, vi.fn());
    store.edit(model, recordInvariant(model.types.find((type) => type.id === id("contact"))));
    store.onChange("channelsEnabled", false);
    const operation = store.operations().find((operation) => operation.operation === "putCapability");
    expect(operation?.operation === "putCapability" && operation.capability).toEqual({ ...binding, enabled: false });
  });
  it("does not rewrite channel configuration when appearance alone changes", () => {
    const model = createCrmPreset(company, "EUR");
    const store = new TypeModalStore(root, model, vi.fn());
    store.edit(model, model.types[0], "appearance");
    store.onChange("layout", "board");
    expect(store.section).toBe("appearance");
    expect(store.operations().map((operation) => operation.operation)).toEqual(["putType"]);
  });
  it("creates enabled channels atomically and uses one stable id across preview and apply", () => {
    const model = createCrmPreset(company, "EUR");
    const store = new TypeModalStore(root, model, vi.fn());
    store.edit(model, null);
    store.onChange("name", "Applicants");
    store.onChange("channelsEnabled", true);
    const first = store.operations();
    const second = store.operations();
    expect(first).toEqual(second);
    expect(first.map((operation) => operation.operation)).toEqual(["createType", "putCapability"]);
    const channels = first[1];
    expect(channels.operation === "putCapability" && channels.capability.typeId).toBe("$type");
  });
  it("saves a dragged field order with the General settings and resets it with the form", () => {
    const model = createCrmPreset(company, "EUR");
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
  it("archives and restores a list with its activity connections and relationships", () => {
    const model = createCrmPreset(company, "EUR");
    const type = model.types[0];
    const store = new TypeModalStore(root, model, vi.fn());
    store.edit(model, type, "archive");
    store.onChange("archived", true);
    expect(store.section).toBe("archive");
    const touches = (relation: (typeof model.relationships)[number]) =>
      relation.sourceTypeId === type.id || relation.targetTypeId === type.id;
    const operations = store.operations();
    expect(operations[0]).toMatchObject({ operation: "putType", type: { id: type.id, archived: true } });
    expect(operations.slice(1)).toEqual([
      ...model.activityPaths
        .filter((path) => path.typeId === type.id)
        .map((path) => ({ operation: "putActivityPath", activityPath: { ...path, archived: true } })),
      ...model.relationships
        .filter(touches)
        .map((relation) => ({ operation: "putRelationship", relationship: { ...relation, archived: true } })),
    ]);
    expect(operations.length).toBeGreaterThan(1);

    const archivedModel = {
      ...model,
      types: model.types.map((item) => (item.id === type.id ? { ...item, archived: true } : item)),
      activityPaths: model.activityPaths.map((path) => (path.typeId === type.id ? { ...path, archived: true } : path)),
      relationships: model.relationships.map((relation) =>
        touches(relation) ? { ...relation, archived: true } : relation,
      ),
    };
    store.edit(archivedModel, recordInvariant(archivedModel.types.find((item) => item.id === type.id)), "archive");
    store.onChange("archived", false);
    expect(store.operations().slice(1)).toHaveLength(operations.length - 1);
  });
});
