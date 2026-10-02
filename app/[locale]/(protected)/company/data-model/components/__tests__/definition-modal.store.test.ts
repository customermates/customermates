import { describe, expect, it, vi } from "vitest";
import type { RootStore } from "@/core/stores/root.store";
import { createCrmPreset, presetId } from "@/features/records/crm-preset";
import { recordInvariant } from "@/features/records/record-invariant";
import { ConfigurationChangeSchema } from "@/features/records/configuration.schema";
vi.mock("../../../../records/actions", () => ({
  applyRecordConfigurationAction: vi.fn(),
  previewRecordConfigurationAction: vi.fn(),
}));
import { FieldModalStore } from "../field-modal";
import { ActivityPathModalStore } from "../activity-path-modal";
import { TypeModalStore } from "../type-modal";
import { RelationshipModalStore } from "../relationship-modal";
const company = "6487f9fb-7b10-439a-b783-9d3da8184b14";
const id = (key: string) => presetId(company, key);
const root = { registerModalStore: vi.fn(), companyStore: { company: { currency: "EUR" } } } as unknown as RootStore;

function validate(operations: unknown) {
  return ConfigurationChangeSchema.parse({ expectedRevision: 1, idempotencyKey: crypto.randomUUID(), operations });
}

describe("configuration modal contracts", () => {
  it("restores archived types and fields through ordinary preview operations without replacing definitions", () => {
    const model = createCrmPreset(company, "EUR");
    const type = recordInvariant(model.types.find((type) => type.id === id("organization")));
    const field = recordInvariant(
      model.fields.find((field) => field.typeId === type.id && field.id !== type.primaryFieldId),
    );
    type.archived = true;
    field.archived = true;
    const typeStore = new TypeModalStore(root, model, vi.fn());
    typeStore.edit(model, type);
    typeStore.onChange("archived", false);
    const typeOperation = validate(typeStore.operations()).operations[0];
    expect(typeOperation.operation === "putType" && typeOperation.type).toMatchObject({
      id: type.id,
      archived: false,
    });
    const fieldStore = new FieldModalStore(root, model, vi.fn());
    fieldStore.edit(model, type.id, field);
    fieldStore.onChange("archived", false);
    const fieldOperation = validate(fieldStore.operations()).operations[0];
    expect(fieldOperation.operation === "putField" && fieldOperation.field).toMatchObject({
      id: field.id,
      archived: false,
      behavior: field.behavior,
    });
  });
  it("restores archived relationships and activity paths with stable ids and endpoint metadata", () => {
    const model = createCrmPreset(company, "EUR");
    const relation = recordInvariant(model.relationships[0]);
    relation.archived = true;
    const relationStore = new RelationshipModalStore(root, model, vi.fn());
    relationStore.edit(model, relation.sourceTypeId, relation);
    relationStore.onChange("archived", false);
    const relationOperation = validate(relationStore.operations()).operations[0];
    expect(relationOperation.operation === "putRelationship" && relationOperation.relationship).toEqual({
      ...relation,
      archived: false,
    });
    const activity = recordInvariant(model.activityPaths[0]);
    activity.archived = true;
    const activityStore = new ActivityPathModalStore(root, model, vi.fn());
    activityStore.edit(model, activity.typeId, activity);
    activityStore.onChange("archived", false);
    const activityOperation = validate(activityStore.operations()).operations[0];
    expect(activityOperation.operation === "putActivityPath" && activityOperation.activityPath).toEqual({
      ...activity,
      archived: false,
    });
  });
  it("preserves and edits generic option metadata while retaining explicit zero probability", () => {
    const model = createCrmPreset(company, "EUR");
    const field = recordInvariant(model.fields.find((field) => field.id === id("deal.stage")));
    const option = recordInvariant(field.options[0]);
    option.attributes = [
      { key: "probability", value: { kind: "decimal", value: "0", currency: null } },
      { key: "priority", value: { kind: "decimal", value: "2.25", currency: null } },
      { key: "active", value: { kind: "boolean", value: false } },
    ];
    const store = new FieldModalStore(root, model, vi.fn());
    store.edit(model, id("deal"), field);
    expect(store.form.options[0].probability).toBe("0");
    store.onChange("options.0.attributes.0.value", { kind: "decimal", value: "3.50", currency: null });
    const operation = validate(store.operations()).operations[0];
    expect(operation.operation).toBe("putField");
    if (operation.operation !== "putField") throw new Error("Expected field operation");
    expect(operation.field.options[0].attributes).toEqual([
      { key: "priority", value: { kind: "decimal", value: "3.50", currency: null } },
      { key: "active", value: { kind: "boolean", value: false } },
      { key: "probability", value: { kind: "decimal", value: "0", currency: null } },
    ]);
  });
  it("round trips a deeply composed seeded calculation unchanged", () => {
    const model = createCrmPreset(company, "EUR");
    const field = recordInvariant(model.fields.find((field) => field.id === id("deal.weightedValue")));
    const store = new FieldModalStore(root, model, vi.fn());
    store.edit(model, id("deal"), field);
    const operation = validate(store.operations()).operations[0];
    expect(operation.operation === "putField" && operation.field.behavior).toEqual(field.behavior);
  });
  it("edits activity paths without dropping relationship directions or auditing choices", () => {
    const model = createCrmPreset(company, "EUR");
    const path = recordInvariant(
      model.activityPaths.find((path) => path.typeId === id("organization") && path.path.length),
    );
    const store = new ActivityPathModalStore(root, model, vi.fn());
    store.edit(model, id("organization"), path);
    store.onChange("includeMessages", false);
    const operation = validate(store.operations()).operations[0];
    expect(operation.operation === "putActivityPath" && operation.activityPath).toEqual({
      ...path,
      includeMessages: false,
    });
  });
  it("creates an explicit self activity path with both supported sources", () => {
    const model = createCrmPreset(company, "EUR");
    const store = new ActivityPathModalStore(root, model, vi.fn());
    store.edit(model, id("organization"));
    store.onChange("label", "Direct activities");
    const operation = validate(store.operations()).operations[0];
    expect(operation.operation === "putActivityPath" && operation.activityPath).toEqual({
      id: "$activityPath",
      typeId: id("organization"),
      label: "Direct activities",
      path: [],
      includeMessages: true,
      includeAudit: true,
      archived: false,
    });
  });
});
