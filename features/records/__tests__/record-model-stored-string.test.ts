import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { ConfigurationChangeSchema } from "../configuration.schema";
import { createCrmPreset } from "../crm-preset";
import { RecordFieldSchema, RecordModelSchema, RecordScalarSchema, RecordTypeSchema } from "../record-model.schema";

const nul = "Before\u0000after";

describe("stored record model strings", () => {
  it("rejects NUL in list names, descriptions and icons", () => {
    const type = createCrmPreset(randomUUID()).types[0];
    for (const field of ["label", "pluralLabel", "description", "icon"] as const) {
      const parsed = RecordTypeSchema.safeParse({ ...type, [field]: nul });
      expect(parsed.success).toBe(false);
      if (!parsed.success) expect(parsed.error.issues).toEqual([expect.objectContaining({ path: [field] })]);
    }
  });

  it("rejects NUL in field, option, relationship and access-preset labels", () => {
    const model = createCrmPreset(randomUUID());
    const field = model.fields.find((candidate) => candidate.options.length > 0);
    if (!field) throw new Error("Expected a selectable field");
    const invalid = [
      { ...model, fields: [{ ...field, label: nul }] },
      {
        ...model,
        fields: [{ ...field, options: [{ ...field.options[0], label: nul }] }],
      },
      {
        ...model,
        relationships: [{ ...model.relationships[0], sourceLabel: nul }],
      },
      {
        ...model,
        relationships: [{ ...model.relationships[0], targetLabel: nul }],
      },
      {
        ...model,
        accessPresets: [{ id: randomUUID(), label: nul, grants: [], archived: false }],
      },
    ];
    for (const candidate of invalid) expect(RecordModelSchema.safeParse(candidate).success).toBe(false);
    expect(RecordFieldSchema.safeParse(field).success).toBe(true);
  });

  it("rejects NUL in option metadata, field formatting and default values", () => {
    const model = createCrmPreset(randomUUID());
    const field = model.fields.find((candidate) => candidate.options.length > 0);
    if (!field) throw new Error("Expected a selectable field");
    const option = field.options[0];
    const candidates = [
      { ...field, format: { color: nul } },
      { ...field, format: { dateFormat: nul } },
      { ...field, options: [{ ...option, id: nul }] },
      { ...field, options: [{ ...option, color: nul }] },
      { ...field, options: [{ ...option, attributes: [{ key: nul, value: { kind: "text", value: "normal" } }] }] },
      { ...field, behavior: { kind: "input", defaultValue: { kind: "text", value: nul } } },
    ];
    for (const candidate of candidates) expect(RecordFieldSchema.safeParse(candidate).success).toBe(false);
    expect(RecordScalarSchema.safeParse({ kind: "text", value: nul }).success).toBe(false);
    expect(RecordScalarSchema.safeParse({ kind: "textList", value: [nul] }).success).toBe(false);
    expect(RecordScalarSchema.safeParse({ kind: "richText", documentJson: nul }).success).toBe(false);
  });

  it("rejects NUL through every configuration write shape", () => {
    const model = createCrmPreset(randomUUID());
    const type = model.types[0];
    const field = model.fields.find((candidate) => candidate.options.length > 0);
    if (!field) throw new Error("Expected a selectable field");
    const change = (operation: unknown) => ({
      expectedRevision: model.revision,
      idempotencyKey: randomUUID(),
      operations: [operation],
    });
    const createType = {
      operation: "createType",
      reference: "$new",
      label: "New",
      pluralLabel: "News",
      description: "A list",
      icon: "list",
      embedded: false,
      accessPresetId: null,
    };
    for (const property of ["label", "pluralLabel", "description", "icon"] as const)
      expect(ConfigurationChangeSchema.safeParse(change({ ...createType, [property]: nul })).success).toBe(false);
    expect(ConfigurationChangeSchema.safeParse({ ...change(createType), idempotencyKey: nul }).success).toBe(false);
    expect(
      ConfigurationChangeSchema.safeParse(change({ operation: "putType", type: { ...type, description: nul } }))
        .success,
    ).toBe(false);
    expect(
      ConfigurationChangeSchema.safeParse(change({ operation: "putField", field: { ...field, label: nul } })).success,
    ).toBe(false);
    expect(
      ConfigurationChangeSchema.safeParse(
        change({
          operation: "putField",
          field: { ...field, options: [{ ...field.options[0], label: nul }] },
        }),
      ).success,
    ).toBe(false);
  });
});
