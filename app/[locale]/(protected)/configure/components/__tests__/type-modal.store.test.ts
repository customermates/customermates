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
    const model = createCrmPreset(company);
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
    const model = createCrmPreset(company);
    const store = new TypeModalStore(root, model, vi.fn());
    store.edit(model, model.types[0], "appearance");
    store.onChange("layout", "board");
    expect(store.section).toBe("appearance");
    expect(store.operations().map((operation) => operation.operation)).toEqual(["putType"]);
  });
  it("creates enabled channels atomically and uses one stable id across preview and apply", () => {
    const model = createCrmPreset(company);
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
  it("archives and restores a list through the archive section", () => {
    const model = createCrmPreset(company);
    const store = new TypeModalStore(root, model, vi.fn());
    store.edit(model, model.types[0], "archive");
    store.onChange("archived", true);
    expect(store.section).toBe("archive");
    expect(store.operations()).toEqual([
      expect.objectContaining({ operation: "putType", type: expect.objectContaining({ archived: true }) }),
    ]);
  });
});
