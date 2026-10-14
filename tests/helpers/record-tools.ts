import type { DiscoveredRecordTypes } from "@/features/records/discover-record-types.interactor";

export const TOOL_TYPE_ID = "11111111-1111-4111-8111-111111111111";
export const TOOL_RECORD_ID = "22222222-2222-4222-8222-222222222222";
export const TOOL_FIELD_ID = "33333333-3333-4333-8333-333333333333";
export const TOOL_CREATE_RECORD = {
  expectedRevision: 1,
  idempotencyKey: "tool-create-record",
  mutation: {
    action: "create" as const,
    typeId: TOOL_TYPE_ID,
    fields: [{ fieldId: TOOL_FIELD_ID, value: { kind: "text" as const, value: "Project A" } }],
  },
};
export const TOOL_CREATE_TYPE = {
  action: "apply" as const,
  change: {
    expectedRevision: 1,
    idempotencyKey: "tool-create-type",
    operations: [
      {
        operation: "createType" as const,
        reference: "$projects",
        label: "Project",
        pluralLabel: "Projects",
        description: "",
        icon: "folder",
        embedded: false,
        accessPresetId: null,
      },
    ],
  },
};
export const EMPTY_RECORD_DISCOVERY: DiscoveredRecordTypes = {
  schemaRevision: 1,
  canManageSchema: false,
  total: 0,
  types: [],
};
export function mockRecordDiscovery(discovery: DiscoveredRecordTypes = EMPTY_RECORD_DISCOVERY) {
  return { invoke: () => Promise.resolve({ ok: true as const, data: discovery }) };
}
