import { describe, expect, it, vi } from "vitest";
import type { RootStore } from "@/core/stores/root.store";
import { createCrmPreset, presetId } from "@/features/records/crm-preset";
import { recordInvariant } from "@/features/records/record-invariant";
import { ConfigurationChangeSchema } from "@/features/records/configuration.schema";
vi.mock("../../../records/actions", () => ({
  applyRecordConfigurationAction: vi.fn(),
  previewRecordConfigurationAction: vi.fn(),
}));
import { FieldModalStore } from "../field-modal";
import { applyRecordConfigurationAction, previewRecordConfigurationAction } from "../../../records/actions";
import { ActivityPathModalStore } from "../activity-path-modal";
import { TypeModalStore } from "../type-modal";
import { RelationshipModalStore } from "../relationship-modal";
vi.mock("@/core/utils/toast-zod-error-tree", () => ({ toastZodErrorTree: vi.fn() }));
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
const company = "6487f9fb-7b10-439a-b783-9d3da8184b14";
const id = (key: string) => presetId(company, key);
const root = { registerModalStore: vi.fn() } as unknown as RootStore;

function validate(operations: unknown) {
  return ConfigurationChangeSchema.parse({ expectedRevision: 1, idempotencyKey: crypto.randomUUID(), operations });
}

describe("configuration modal contracts", () => {
  it("restores archived types and fields through ordinary preview operations without replacing definitions", () => {
    const model = createCrmPreset(company);
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
    const model = createCrmPreset(company);
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
    const model = createCrmPreset(company);
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
    const model = createCrmPreset(company);
    const field = recordInvariant(model.fields.find((field) => field.id === id("deal.weightedValue")));
    const store = new FieldModalStore(root, model, vi.fn());
    store.edit(model, id("deal"), field);
    const operation = validate(store.operations()).operations[0];
    expect(operation.operation === "putField" && operation.field.behavior).toEqual(field.behavior);
  });
  it("edits activity paths without dropping relationship directions or auditing choices", () => {
    const model = createCrmPreset(company);
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
    const model = createCrmPreset(company);
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

describe("field value defaults and typed snapshot triggers", () => {
  it("distinguishes an absent Boolean default from an explicitly false default", () => {
    const model = createCrmPreset(company);
    const store = new FieldModalStore(root, model, vi.fn());
    store.edit(model, id("organization"), null);
    store.onChange("label", "Confirmed");
    store.onChange("valueType", "boolean");
    let operation = validate(store.operations()).operations[0];
    expect(operation.operation === "putField" && operation.field.behavior).toEqual({ kind: "input" });
    store.onChange("hasDefaultValue", true);
    operation = validate(store.operations()).operations[0];
    expect(operation.operation === "putField" && operation.field.behavior).toEqual({
      kind: "input",
      defaultValue: { kind: "boolean", value: false },
    });
    store.onChange("hasDefaultValue", false);
    operation = validate(store.operations()).operations[0];
    expect(operation.operation === "putField" && operation.field.behavior).toEqual({ kind: "input" });
  });
  it("preserves zero and exact decimal defaults, then clears incompatible local defaults when type changes", () => {
    const model = createCrmPreset(company);
    const store = new FieldModalStore(root, model, vi.fn());
    store.edit(model, id("organization"), null);
    store.onChange("label", "Budget");
    store.onChange("valueType", "currency");
    store.onChange("hasDefaultValue", true);
    store.onChange("defaultValue", "0");
    let operation = validate(store.operations()).operations[0];
    expect(operation.operation === "putField" && operation.field.behavior).toEqual({
      kind: "input",
      defaultValue: { kind: "decimal", value: "0", currency: "EUR" },
    });
    store.onChange("defaultValue", "1234567890.123456789");
    operation = validate(store.operations()).operations[0];
    expect(operation.operation === "putField" && operation.field.behavior).toEqual({
      kind: "input",
      defaultValue: { kind: "decimal", value: "1234567890.123456789", currency: "EUR" },
    });
    store.onChange("valueType", "boolean");
    expect(store.form.hasDefaultValue).toBe(false);
    expect(store.form.defaultValue).toBeUndefined();
  });
  it("round trips Boolean, date-range and rich-text snapshot trigger values without string coercion", () => {
    const model = createCrmPreset(company);
    const base = recordInvariant(model.fields.find((field) => field.id === id("deal.name")));
    const cases = [
      { type: "boolean" as const, value: { kind: "boolean" as const, value: false } },
      { type: "dateRange" as const, value: { kind: "range" as const, start: "2026-10-03", end: "2026-10-06" } },
      { type: "richText" as const, value: { kind: "richText" as const, documentJson: JSON.stringify({ blocks: [] }) } },
    ];
    for (const item of cases) {
      const trigger = { ...base, valueType: item.type, behavior: { kind: "input" as const } };
      const field = {
        ...recordInvariant(model.fields.find((field) => field.id === id("deal.totalValue"))),
        behavior: {
          kind: "snapshot" as const,
          expression: { kind: "literal" as const, value: { kind: "decimal" as const, value: "7", currency: "EUR" } },
          capture: "whenChanged" as const,
          triggerFieldId: trigger.id,
          triggerValue: item.value,
        },
      };
      const configured = { ...model, fields: model.fields.map((field) => (field.id === trigger.id ? trigger : field)) };
      configured.fields = configured.fields.filter((definition) => definition.id !== field.id).concat(field);
      const store = new FieldModalStore(root, configured, vi.fn());
      store.edit(configured, id("deal"), field);
      const operation = validate(store.operations()).operations[0];
      expect(operation.operation === "putField" && operation.field.behavior).toEqual({
        ...field.behavior,
        allowManualOverride: false,
      });
    }
  });
});

describe("field summary publication previews", () => {
  function setup(admin: boolean) {
    const model = createCrmPreset(company);
    const completed = vi.fn().mockResolvedValue(undefined);
    const configuredRoot = {
      ...root,
      recordWorkspaceStore: { refreshNavigation: vi.fn().mockResolvedValue(undefined) },
    } as unknown as RootStore;
    const store = new FieldModalStore(configuredRoot, model, completed, admin);
    const field = recordInvariant(model.fields.find((field) => field.id === id("deal.weightedValue")));
    store.edit(model, id("deal"), field);
    return { store, field };
  }
  function preview(fieldId: string, hash: string, valid = true) {
    return {
      ok: true as const,
      data: {
        expectedRevision: 1,
        nextRevision: 2,
        valid,
        execution: "synchronous" as const,
        dataValidation: "complete" as const,
        affectedRecords: 0,
        references: [],
        issues: [],
        calculations: [{ fieldId, dependencyHash: hash }],
      },
    };
  }
  it("previews the server-approved dependency bundle before applying and keeps the same hash and idempotency key", async () => {
    vi.mocked(previewRecordConfigurationAction).mockReset();
    vi.mocked(applyRecordConfigurationAction).mockReset();
    const { store, field } = setup(true);
    const hash = "a".repeat(64);
    store.onChange("publishedSummary", true);
    vi.mocked(previewRecordConfigurationAction)
      .mockResolvedValueOnce(preview(field.id, hash))
      .mockResolvedValueOnce(preview(field.id, hash));
    await store.onSubmit();
    expect(previewRecordConfigurationAction).toHaveBeenCalledTimes(2);
    expect(applyRecordConfigurationAction).not.toHaveBeenCalled();
    const approved = vi.mocked(previewRecordConfigurationAction).mock.calls[1][0];
    expect(approved.operations).toContainEqual({
      operation: "publishSummary",
      fieldId: field.id,
      published: true,
      dependencyHash: hash,
    });
    vi.mocked(applyRecordConfigurationAction).mockResolvedValueOnce({
      ok: true,
      data: { status: "completed", refs: [], schemaRevision: 2 },
    });
    await store.onSubmit();
    expect(applyRecordConfigurationAction).toHaveBeenCalledExactlyOnceWith(approved);
  });
  it("does not emit publication authority from an ordinary schema manager's local draft", async () => {
    vi.mocked(previewRecordConfigurationAction).mockReset();
    vi.mocked(applyRecordConfigurationAction).mockReset();
    const { store, field } = setup(false);
    store.onChange("publishedSummary", true);
    vi.mocked(previewRecordConfigurationAction).mockResolvedValueOnce(preview(field.id, "a".repeat(64)));
    await store.onSubmit();
    expect(previewRecordConfigurationAction).toHaveBeenCalledOnce();
    expect(
      vi
        .mocked(previewRecordConfigurationAction)
        .mock.calls[0][0].operations.some((operation) => operation.operation === "publishSummary"),
    ).toBe(false);
  });
  it("retries a failed approval preview without adding duplicate publication operations", async () => {
    vi.mocked(previewRecordConfigurationAction).mockReset();
    vi.mocked(applyRecordConfigurationAction).mockReset();
    const { store, field } = setup(true);
    const hash = "c".repeat(64);
    store.onChange("publishedSummary", true);
    vi.mocked(previewRecordConfigurationAction)
      .mockResolvedValueOnce(preview(field.id, hash))
      .mockResolvedValueOnce({
        ok: false,
        error: { errors: ["Unavailable"] },
        failure: { kind: "unavailable", issues: [{ code: "custom", path: [], message: "Unavailable" }] },
      });
    await store.onSubmit();
    expect(store.preview).toBeNull();
    vi.mocked(previewRecordConfigurationAction).mockResolvedValueOnce(preview(field.id, hash));
    await store.onSubmit();
    expect(previewRecordConfigurationAction).toHaveBeenCalledTimes(3);
    expect(store.operations().filter((operation) => operation.operation === "publishSummary")).toEqual([
      { operation: "publishSummary", fieldId: field.id, published: true, dependencyHash: hash },
    ]);
    expect(applyRecordConfigurationAction).not.toHaveBeenCalled();
  });
  it("renews a published field against the changed dependency hash and drops approval after another edit", async () => {
    vi.mocked(previewRecordConfigurationAction).mockReset();
    vi.mocked(applyRecordConfigurationAction).mockReset();
    const { store, field } = setup(true);
    field.publishedSummary = true;
    store.edit(store.model, id("deal"), field);
    store.onChange("expression", { kind: "literal", value: { kind: "decimal", value: "10", currency: "EUR" } });
    vi.mocked(previewRecordConfigurationAction)
      .mockResolvedValueOnce(preview(field.id, "b".repeat(64), false))
      .mockResolvedValueOnce(preview(field.id, "b".repeat(64)));
    await store.onSubmit();
    expect(store.preview?.valid).toBe(true);
    expect(store.operations()).toContainEqual({
      operation: "publishSummary",
      fieldId: field.id,
      published: true,
      dependencyHash: "b".repeat(64),
    });
    store.onChange("expression", { kind: "literal", value: { kind: "decimal", value: "20", currency: "EUR" } });
    expect(store.preview).toBeNull();
    expect(store.operations().some((operation) => operation.operation === "publishSummary")).toBe(false);
  });
});

describe("field decimal display formatting", () => {
  it("round trips precision, supports zero and clearing, and retains exact defaults and unrelated formatting", () => {
    const model = createCrmPreset(company);
    const field = recordInvariant(model.fields.find((field) => field.id === id("service.amount")));
    field.format = { ...field.format, decimalPlaces: 3, color: "success" };
    field.behavior = { kind: "input", defaultValue: { kind: "decimal", value: "19.876500000125", currency: "EUR" } };
    const store = new FieldModalStore(root, model, vi.fn());
    store.edit(model, field.typeId, field);
    expect(store.form.decimalPlaces).toBe("3");
    expect(validate(store.operations()).operations[0]).toMatchObject({
      operation: "putField",
      field: { format: { decimalPlaces: 3, currency: "EUR", color: "success" }, behavior: field.behavior },
    });
    store.onChange("decimalPlaces", "0");
    expect(validate(store.operations()).operations[0]).toMatchObject({
      operation: "putField",
      field: { format: { decimalPlaces: 0 }, behavior: field.behavior },
    });
    store.onChange("decimalPlaces", "");
    expect(validate(store.operations()).operations[0]).toMatchObject({
      operation: "putField",
      field: { format: { decimalPlaces: null, currency: "EUR", color: "success" }, behavior: field.behavior },
    });
  });
  it.each(["0", "30"])("accepts the backend's integer formatting boundary %s", (precision) => {
    const model = createCrmPreset(company);
    const store = new FieldModalStore(root, model, vi.fn());
    store.edit(model, id("organization"), null);
    store.onChange("label", "Formatted amount");
    store.onChange("valueType", "number");
    store.onChange("decimalPlaces", precision);
    expect(validate(store.operations()).operations[0]).toMatchObject({
      operation: "putField",
      field: { format: { decimalPlaces: Number(precision), currency: null } },
    });
  });
  it.each(["-1", "31", "1.5", "invalid"])(
    "rejects invalid formatting precision %s without rounding it",
    (precision) => {
      const model = createCrmPreset(company);
      const store = new FieldModalStore(root, model, vi.fn());
      store.edit(model, id("organization"), null);
      store.onChange("label", "Formatted amount");
      store.onChange("valueType", "number");
      store.onChange("decimalPlaces", precision);
      expect(() => validate(store.operations())).toThrow();
      expect(store.form.decimalPlaces).toBe(precision);
    },
  );
  it("drops numeric display formatting when the field changes to a nonnumeric value type", () => {
    const model = createCrmPreset(company);
    const field = recordInvariant(model.fields.find((field) => field.id === id("service.amount")));
    field.format = { ...field.format, decimalPlaces: 4 };
    const store = new FieldModalStore(root, model, vi.fn());
    store.edit(model, field.typeId, field);
    store.onChange("valueType", "text");
    expect(store.form.decimalPlaces).toBe("");
    expect(validate(store.operations()).operations[0]).toMatchObject({
      operation: "putField",
      field: { valueType: "text", format: { decimalPlaces: null, currency: null } },
    });
  });
});

describe("configuration form validation feedback", () => {
  it.each(["-1", "31", "1.5", "invalid"])(
    "retains invalid precision %s without sending it or reporting an application failure",
    async (precision) => {
      vi.mocked(previewRecordConfigurationAction).mockClear();
      vi.mocked(applyRecordConfigurationAction).mockClear();
      vi.mocked(toastZodErrorTree).mockClear();
      const model = createCrmPreset(company);
      const store = new FieldModalStore(root, model, vi.fn());
      store.edit(model, id("organization"), null);
      store.onChange("label", "Formatted amount");
      store.onChange("valueType", "number");
      store.onChange("decimalPlaces", precision);
      await expect(store.onSubmit()).resolves.toBeUndefined();
      expect(store.form.decimalPlaces).toBe(precision);
      expect(store.isOpen).toBe(true);
      expect(store.isLoading).toBe(false);
      expect(store.preview).toBeNull();
      expect(toastZodErrorTree).toHaveBeenCalledOnce();
      expect(previewRecordConfigurationAction).not.toHaveBeenCalled();
      expect(applyRecordConfigurationAction).not.toHaveBeenCalled();
    },
  );
});

describe("Channels field", () => {
  it("deletes and restores the channels binding without replacing its identity, naming roles or avatar setting", () => {
    const model = createCrmPreset(company);
    const binding = recordInvariant(
      model.capabilities.find((candidate) => candidate.kind === "channels" && candidate.typeId === id("contact")),
    );
    const store = new FieldModalStore(root, model, vi.fn());
    store.editChannels(model, id("contact"));
    expect(store.isChannels).toBe(true);
    store.onChange("archived", true);
    const archived = validate(store.operations()).operations[0];
    expect(archived.operation === "putCapability" && archived.capability).toEqual({ ...binding, enabled: false });
    store.onChange("archived", false);
    const restored = validate(store.operations()).operations[0];
    expect(restored.operation === "putCapability" && restored.capability).toEqual({ ...binding, enabled: true });
  });

  it("adds one Channels field from the Add menu with a stable binding id", () => {
    const model = createCrmPreset(company);
    const store = new FieldModalStore(root, model, vi.fn());
    store.edit(model, id("organization"), null, { valueType: "channels" });
    expect(store.isChannels).toBe(true);
    const first = validate(store.operations()).operations;
    expect(validate(store.operations()).operations).toEqual(first);
    expect(first).toHaveLength(1);
    expect(first[0].operation === "putCapability" && first[0].capability).toMatchObject({
      kind: "channels",
      typeId: id("organization"),
      enabled: true,
      providerAvatar: false,
      fields: [],
    });
  });
});
