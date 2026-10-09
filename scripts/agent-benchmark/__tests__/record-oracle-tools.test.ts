import { describe, expect, it } from "vitest";

import { presetId } from "@/features/records/crm-preset";
import { isRecordMutation, recordMutation, recordQuery, withoutRecordState } from "../record-oracle-tools";

const companyId = "10000000-0000-4000-8000-000000000001";
const dealType = presetId(companyId, "deal");
const contactType = presetId(companyId, "contact");
const customField = "10000000-0000-4000-8000-000000000002";
const snapshot = () => ({
  deal: [{ id: "deal", name: "Preserved" }],
  customColumn: [{ id: customField, entityType: "deal" }],
  customFieldValue: [{ columnId: customField, value: "open" }],
  "generic:recordSchemaState": [{ companyId, revision: 1 }],
  "generic:crmRecord": [{ typeId: dealType, id: "deal", version: 1 }, { typeId: contactType, id: "contact", version: 1 }],
  "generic:recordValue": [{ typeId: dealType, recordId: "deal", fieldId: customField, textValue: "open" }, { typeId: contactType, recordId: "contact", fieldId: presetId(companyId, "contact.firstName"), textValue: "Preserved" }],
  "generic:recordTypeGrant": [{ typeId: contactType, roleId: "role", actions: ["readAll"] }],
  "generic:model": [{ revision: 1, capabilities: [{ id: "identity", typeId: contactType }], fields: [{ id: customField }, { id: presetId(companyId, "contact.firstName") }] }],
});
describe("current record benchmark oracles", () => {
  it("reads the queried type, page, grouping and filter fields from a typed query", () => {
    const current = { name: "query_crm_records", input: { typeId: dealType, page: 2, filters: [{ fieldId: customField, operator: "equal", value: "open" }] }, outcome: "ok" };
    expect(recordQuery(current, companyId)).toEqual({ kind: "deal", page: 2, grouped: false, filterFieldIds: [customField], measure: false });
    expect(recordQuery({ name: "query_crm_measure", input: { source: { typeId: contactType }, groupBy: { fieldId: "system:assignedTo" } } }, companyId)).toMatchObject({ kind: "contact", grouped: true, measure: true });
    expect(recordQuery({ name: "read_crm_record", input: { typeId: dealType } }, companyId)).toBeNull();
  });
  it("classifies record mutations for the scoped write and approval oracles", () => {
    const input = { expectedRevision: 1, idempotencyKey: "oracle-delete", mutation: { action: "delete", ref: { typeId: dealType, recordId: "target" }, expectedVersion: 2 } };
    expect(recordMutation({ name: "mutate_crm_record", input, outcome: "cancelled" }, companyId)).toEqual({ kind: "delete", type: "deal", recordIds: ["target"] });
    const append = { mutation: { action: "update", ref: { typeId: dealType, recordId: "target" }, fields: [{ fieldId: presetId(companyId, "deal.notes"), append: "Next step" }] } };
    expect(recordMutation({ name: "mutate_crm_record", input: append }, companyId)?.kind).toBe("append");
    const rewrite = { mutation: { action: "update", ref: { typeId: dealType, recordId: "target" }, fields: [{ fieldId: presetId(companyId, "deal.notes"), value: null }] } };
    expect(recordMutation({ name: "mutate_crm_record", input: rewrite }, companyId)?.kind).toBe("update");
    expect(isRecordMutation({ name: "mutate_crm_record", input: { mutation: { action: "create", typeId: contactType } } }, companyId, ["create"], "contact")).toBe(true);
    expect(isRecordMutation({ name: "query_crm_records", input: { typeId: dealType } }, companyId, ["create", "update", "append", "delete", "link"])).toBe(false);
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
