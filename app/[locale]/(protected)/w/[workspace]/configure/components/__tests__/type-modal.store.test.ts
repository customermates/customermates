import { recordInvariant } from "@/features/records/record-invariant";
import { describe, expect, it, vi } from "vitest";
import type { RootStore } from "@/core/stores/root.store";
import { createCrmPreset, presetId } from "@/features/records/crm-preset";
import { recordNameIssues, recordPictureIssues, validateRecordModel } from "@/features/records/record-model-validation";
vi.mock("../../../records/actions", () => ({
  applyRecordConfigurationAction: vi.fn(),
  previewRecordConfigurationAction: vi.fn(),
}));
import { TypeModalStore } from "../type-modal";
const company = "6487f9fb-7b10-439a-b783-9d3da8184b14";
const id = (key: string) => presetId(company, key);
const root = { registerModalStore: vi.fn(), localeStore: { locale: "en" } } as unknown as RootStore;

describe("list configuration", () => {
  it("changes the display name and link color through existing list configuration and resets both", () => {
    const model = createCrmPreset(company);
    const contact = recordInvariant(model.types.find((type) => type.id === id("contact")));
    const store = new TypeModalStore(root, model, vi.fn());
    store.edit(model, contact);
    expect(store.form.recordNameFieldId).toBe(contact.primaryFieldId);
    store.onChange("recordNameFieldId", id("contact.firstName"));
    store.onChange("color", "success");
    expect(store.hasUnsavedChanges).toBe(true);
    expect(store.operations()[0]).toMatchObject({
      operation: "putType",
      type: { primaryFieldId: id("contact.firstName"), color: "success" },
    });
    expect(store.operations().some((operation) => operation.operation === "putCapability")).toBe(false);
    store.resetForm();
    expect(store.form.recordNameFieldId).toBe(contact.primaryFieldId);
    expect(store.form.color).toBe(contact.color ?? "secondary");
    expect(store.hasUnsavedChanges).toBe(false);
  });
  it("uses the same scalar text eligibility in the chooser and backend validation", () => {
    const model = createCrmPreset(company);
    const contact = recordInvariant(model.types.find((type) => type.id === id("contact")));
    const name = recordInvariant(model.fields.find((field) => field.id === contact.primaryFieldId));
    const previous = structuredClone(model);
    model.fields.push(
      { ...name, id: crypto.randomUUID(), multiple: true },
      { ...name, id: crypto.randomUUID(), archived: true },
    );
    const store = new TypeModalStore(root, model, vi.fn());
    store.edit(model, contact);
    expect(store.recordNameFields.map((field) => field.id)).toEqual([
      name.id,
      id("contact.firstName"),
      id("contact.lastName"),
    ]);
    name.multiple = true;
    expect(recordNameIssues(model, previous)).toContainEqual({
      code: "invalid_primary_field",
      typeId: contact.id,
      fieldId: name.id,
    });
    expect(validateRecordModel(model).issues).toEqual([]);
    expect(recordNameIssues(model, model)).toEqual([]);
  });
  it("rejects new multiple-value pictures while keeping existing picture models compatible", () => {
    const model = createCrmPreset(company);
    const previous = structuredClone(model);
    const field = recordInvariant(model.fields.find((field) => field.id === id("contact.avatarUrl")));
    field.multiple = true;
    expect(recordPictureIssues(model, previous)).toContainEqual({
      code: "capability_requires_field",
      fieldId: field.id,
    });
    expect(validateRecordModel(model).issues).toEqual([]);
    expect(recordPictureIssues(model, model)).toEqual([]);
    const rebound = structuredClone(model);
    const picture = recordInvariant(rebound.fields.find((candidate) => candidate.id === field.id));
    picture.id = crypto.randomUUID();
    const binding = recordInvariant(rebound.capabilities.find((binding) => binding.kind === "avatar"));
    binding.fields[0].fieldId = picture.id;
    expect(recordPictureIssues(rebound, model)).toContainEqual({
      code: "capability_requires_field",
      fieldId: picture.id,
    });
    const deleted = structuredClone(model);
    const deletedField = recordInvariant(deleted.fields.find((candidate) => candidate.id === field.id));
    deletedField.archived = true;
    const deletedBinding = recordInvariant(deleted.capabilities.find((candidate) => candidate.kind === "avatar"));
    deletedBinding.fields = [];
    expect(recordPictureIssues(model, deleted)).toContainEqual({
      code: "capability_requires_field",
      fieldId: field.id,
    });
    expect(
      recordPictureIssues(model, deleted, [{ bindingId: deletedBinding.id, role: "image", fieldId: field.id }]),
    ).toEqual([]);
    expect(
      recordPictureIssues(model, deleted, [{ bindingId: crypto.randomUUID(), role: "image", fieldId: field.id }]),
    ).toContainEqual({ code: "capability_requires_field", fieldId: field.id });
  });
  it("exposes the existing picture mapping and changes it through the capability operation", () => {
    const model = createCrmPreset(company);
    const contact = recordInvariant(model.types.find((type) => type.id === id("contact")));
    const store = new TypeModalStore(root, model, vi.fn());
    store.edit(model, contact);
    expect(store.form.pictureFieldId).toBe(id("contact.avatarUrl"));
    expect(store.operations().some((operation) => operation.operation === "putCapability")).toBe(false);
    store.onChange("pictureFieldId", "__none__");
    expect(store.hasUnsavedChanges).toBe(true);
    expect(store.operations()).toContainEqual({
      operation: "putCapability",
      capability: {
        id: id("capability.avatar"),
        kind: "avatar",
        typeId: contact.id,
        fields: [],
      },
    });
    store.resetForm();
    expect(store.form.pictureFieldId).toBe(id("contact.avatarUrl"));
    expect(store.hasUnsavedChanges).toBe(false);
  });
  it("offers only live single-value URL fields from the selected list", () => {
    const model = createCrmPreset(company);
    const avatar = recordInvariant(model.fields.find((field) => field.id === id("contact.avatarUrl")));
    model.fields.push(
      { ...avatar, id: crypto.randomUUID(), archived: true },
      { ...avatar, id: crypto.randomUUID(), multiple: true },
      { ...avatar, id: crypto.randomUUID(), typeId: id("organization") },
    );
    const store = new TypeModalStore(root, model, vi.fn());
    store.edit(model, recordInvariant(model.types.find((type) => type.id === id("contact"))));
    expect(store.pictureFields.map((field) => field.id)).toEqual([avatar.id]);
  });
  it("defaults an unconfigured list to None and keeps a new mapping stable across previews", () => {
    const model = createCrmPreset(company);
    const organization = recordInvariant(model.types.find((type) => type.id === id("organization")));
    const avatar = recordInvariant(model.fields.find((field) => field.id === id("contact.avatarUrl")));
    model.fields.push({ ...avatar, id: id("organization.website"), typeId: organization.id });
    const store = new TypeModalStore(root, model, vi.fn());
    store.edit(model, organization);
    expect(store.form.pictureFieldId).toBe("__none__");
    store.onChange("pictureFieldId", id("organization.website"));
    const operations = store.operations();
    expect(store.operations()).toEqual(operations);
    expect(operations).toContainEqual({
      operation: "putCapability",
      capability: {
        id: "$avatar",
        kind: "avatar",
        typeId: organization.id,
        fields: [{ role: "image", fieldId: id("organization.website") }],
      },
    });
  });
  it("keeps picture configuration read-only for a non-administrator", () => {
    const model = createCrmPreset(company);
    for (const isSystemRole of [false, true]) {
      const userRoot = {
        ...root,
        userStore: { user: { role: { isSystemRole } } },
      } as unknown as RootStore;
      const store = new TypeModalStore(userRoot, model, vi.fn());
      expect(store.canEditRecordPicture).toBe(isSystemRole);
    }
  });
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
  it("saves list settings without any list layout", () => {
    const model = createCrmPreset(company);
    const store = new TypeModalStore(root, model, vi.fn());
    store.edit(model, model.types[0]);
    store.onChange("description", "People we talk to");
    const [operation] = store.operations();
    expect(operation).toMatchObject({ operation: "putType", type: { description: "People we talk to" } });
    expect(operation.operation === "putType" && "defaults" in operation.type).toBe(false);
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
