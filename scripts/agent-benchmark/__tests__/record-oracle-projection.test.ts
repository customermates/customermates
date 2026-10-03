import { describe, expect, it } from "vitest";

import { presetId } from "@/features/records/crm-preset";
import { projectRecordTool, usesRetiredRecordTool, withoutRecordState } from "../record-oracle-projection";

const companyId = "10000000-0000-4000-8000-000000000001";
const dealType = presetId(companyId, "deal");
const contactType = presetId(companyId, "contact");
const customField = "10000000-0000-4000-8000-000000000002";
const snapshot = () => ({
  deal: [{ id: "deal", name: "Preserved" }],
  customColumn: [{ id: customField, entityType: "deal" }],
  customFieldValue: [{ columnId: customField, value: "open" }],
  "generic:recordSchemaState": [{ companyId, revision: 1, storageMode: "generic" }],
  "generic:crmRecord": [{ typeId: dealType, id: "deal", version: 1 }, { typeId: contactType, id: "contact", version: 1 }],
  "generic:recordValue": [{ typeId: dealType, recordId: "deal", fieldId: customField, textValue: "open" }, { typeId: contactType, recordId: "contact", fieldId: presetId(companyId, "contact.firstName"), textValue: "Preserved" }],
  "generic:recordTypeGrant": [{ typeId: contactType, roleId: "role", actions: ["readAll"] }],
  "generic:model": [{ revision: 1, capabilities: [{ id: "identity", typeId: contactType }], fields: [{ id: customField }, { id: presetId(companyId, "contact.firstName") }] }],
});
describe("current record benchmark oracles", () => {
  it("projects a current typed query and distinguishes actual retired calls", () => {
    const current = { name: "query_crm_records", input: { typeId: dealType, filters: [{ fieldId: customField, operator: "equal", value: "open" }] }, outcome: "ok" };
    expect(usesRetiredRecordTool([current])).toBe(false);
    expect(projectRecordTool(current, companyId)).toMatchObject({ name: "list_records", input: { entity: "deal", filters: [{ field: customField }] } });
    expect(usesRetiredRecordTool([{ name: "list_records" }])).toBe(true);
  });
  it("keeps mutation references available to the scoped write and approval oracles", () => {
    const input = { expectedRevision: 1, idempotencyKey: "oracle-delete", mutation: { action: "delete", ref: { typeId: dealType, recordId: "target" }, expectedVersion: 2 } };
    expect(projectRecordTool({ name: "mutate_crm_record", input, outcome: "cancelled" }, companyId)).toMatchObject({ name: "delete_records", input: { ...input, ids: ["target"] }, outcome: "cancelled" });
  });
  it("permits a specified custom-field update while detecting another record's changes", () => {
    const before = snapshot(), after = snapshot();
    after.customFieldValue[0].value = "won";
    after["generic:recordValue"][0].textValue = "won";
    after["generic:crmRecord"][0].version = 2;
    expect(withoutRecordState(after, ["customFieldValue"])).toEqual(withoutRecordState(before, ["customFieldValue"]));
    after["generic:recordValue"][1].textValue = "Collateral";
    expect(withoutRecordState(after, ["customFieldValue"])).not.toEqual(withoutRecordState(before, ["customFieldValue"]));
  });
  it("keeps permissions and protected bindings under every schema-change oracle", () => {
    const before = snapshot(), after = snapshot();
    after["generic:recordTypeGrant"][0].actions.push("update");
    expect(withoutRecordState(after, ["customColumn", "customFieldValue"])).not.toEqual(withoutRecordState(before, ["customColumn", "customFieldValue"]));
    after["generic:recordTypeGrant"][0].actions = ["readAll"];
    after["generic:model"][0].capabilities[0].typeId = dealType;
    expect(withoutRecordState(after, ["customColumn", "customFieldValue"])).not.toEqual(withoutRecordState(before, ["customColumn", "customFieldValue"]));
  });
  it("permits a revision stamp after a field addition while still detecting changed source values", () => {
    const before = snapshot(), after = snapshot();
    const baseline = { ...before, "generic:recordValue": before["generic:recordValue"].map((row) => ({ ...row, schemaRevision: 1 })) };
    const revised = { ...after, "generic:recordValue": after["generic:recordValue"].map((row) => ({ ...row, schemaRevision: 2 })) };
    expect(withoutRecordState(revised, ["customColumn", "customFieldValue"])).toEqual(withoutRecordState(baseline, ["customColumn", "customFieldValue"]));
    revised["generic:recordValue"][1].textValue = "Collateral";
    expect(withoutRecordState(revised, ["customColumn", "customFieldValue"])).not.toEqual(withoutRecordState(baseline, ["customColumn", "customFieldValue"]));
  });
});
