import { describe, expect, it } from "vitest";

import { recordValueDescriptor } from "@/features/messaging/activities/change-value-descriptor";
import { ProviderConfigurationChangeSchema } from "../configuration-provider.schema";
import {
  ConfigurationContractSchema,
  ConfigurationChangeSchema,
  PublicConfigurationChangeSchema,
} from "../configuration.schema";
import { createCrmPreset, presetId } from "../crm-preset";
import { historicalRecordModel, historicalRevisionChange } from "../historical-record-model";
import { RecordEventPayloadSchema } from "../record-event.schema";
import { RecordModelSchema, RecordValueTypeSchema } from "../record-model.schema";
import { RecordRevisionChangeSchema } from "../record-revision.schema";

const companyId = "74000000-0000-4000-8000-000000000001";
const contact = presetId(companyId, "contact");
const phoneId = "74000000-0000-4000-8000-000000000002";
const phoneInput = {
  id: phoneId,
  typeId: contact,
  label: "Phone",
  valueType: "phone",
  behavior: { kind: "input" },
  required: false,
  multiple: true,
  format: { onClick: "copy" },
  archived: false,
  options: [],
  position: 40,
};
const legacyPhone = { ...phoneInput, publishedSummary: false };
const putPhone = {
  expectedRevision: 3,
  idempotencyKey: "retired-phone-field",
  operations: [{ operation: "putField", field: phoneInput }],
};

describe("retired phone value type", () => {
  it("refuses phone everywhere a field type is written, pointing to Channels", () => {
    const refusal = RecordValueTypeSchema.safeParse("phone");
    expect(refusal.success).toBe(false);
    expect(refusal.error?.issues[0]?.message).toContain("phone numbers are channel identities");
    expect(RecordValueTypeSchema.options).not.toContain("phone");
    for (const schema of [
      PublicConfigurationChangeSchema,
      ConfigurationChangeSchema,
      ConfigurationContractSchema,
      ProviderConfigurationChangeSchema,
    ]) {
      const result = schema.safeParse(putPhone);
      expect(result.success).toBe(false);
      expect(result.error?.issues).toContainEqual(
        expect.objectContaining({
          path: ["operations", 0, "field", "valueType"],
          message: expect.stringContaining("Add a channels field to the list"),
        }),
      );
    }
    const text = { ...putPhone, operations: [{ operation: "putField", field: { ...phoneInput, valueType: "text" } }] };
    expect(PublicConfigurationChangeSchema.safeParse(text).success).toBe(true);
  });

  it("reads configuration history that still holds phone fields as text", () => {
    const preset = createCrmPreset(companyId);
    const snapshot = JSON.parse(JSON.stringify({ ...preset, fields: [...preset.fields, legacyPhone] }));
    expect(RecordModelSchema.safeParse(snapshot).success).toBe(false);
    const model = RecordModelSchema.parse(historicalRecordModel(snapshot));
    expect(model.fields.find((field) => field.id === phoneId)).toMatchObject({ label: "Phone", valueType: "text" });
    const change = {
      version: 1,
      source: { kind: "configuration" },
      causeId: "retired-phone-field",
      expectedRevision: 3,
      configuration: putPhone,
      references: [],
      grants: [],
    };
    expect(RecordRevisionChangeSchema.safeParse(change).success).toBe(false);
    expect(
      RecordRevisionChangeSchema.parse(historicalRevisionChange(change)).configuration?.operations[0],
    ).toMatchObject({ operation: "putField", field: { id: phoneId, valueType: "text" } });
    expect(historicalRecordModel(null)).toBeNull();
    expect(historicalRevisionChange({ version: 1 })).toEqual({ version: 1 });
  });

  it("keeps record history of phone fields readable and renders it as text", () => {
    const value = {
      fieldId: phoneId,
      label: "Phone",
      valueType: "phone",
      format: { onClick: "copy" },
      options: [],
      value: { state: "value", value: { kind: "textList", value: ["+49621123456"] } },
      sources: [],
      publications: [],
      publishedSummary: false,
      dependencyHash: "",
    };
    const payload = RecordEventPayloadSchema.parse({
      ref: { typeId: contact, recordId: "74000000-0000-4000-8000-000000000003" },
      schemaRevision: 2,
      cause: { kind: "mutation" },
      beforeVersion: 1,
      afterVersion: 2,
      changedFieldIds: [phoneId],
      fields: [{ fieldId: phoneId, before: null, after: value }],
      assignments: null,
      identities: null,
      links: [],
    });
    const descriptor = recordValueDescriptor(payload.fields[0].after, contact, [], "Former member");
    expect(descriptor).toMatchObject({
      kind: "field",
      field: { label: "Phone", valueType: "text" },
      result: { state: "value", value: { kind: "textList", value: ["+49621123456"] } },
    });
  });
});
