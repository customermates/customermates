import type { RecordEventPayload, RecordHistoryValue } from "../record-event.schema";
import type { RecordModel } from "../record-model.schema";
import type { RecordRepo } from "../record.repo";

import { describe, expect, it } from "vitest";

import { RecordHistoryReader } from "../record-history-reader";

const typeId = crypto.randomUUID();
const nameId = crypto.randomUUID();
const avatarId = crypto.randomUUID();
const ref = { typeId, recordId: crypto.randomUUID() };

function value(fieldId: string, label: string, text: string | null, dependencyHash: string): RecordHistoryValue {
  return {
    fieldId,
    label,
    valueType: "text",
    options: [],
    value: text === null ? { state: "missing" } : { state: "value", value: { kind: "text", value: text } },
    sources: [],
    publications: [],
    publishedSummary: false,
    dependencyHash,
  } as RecordHistoryValue;
}

const payload: RecordEventPayload = {
  ref,
  schemaRevision: 1,
  cause: { kind: "system" },
  beforeVersion: 4,
  afterVersion: 5,
  changedFieldIds: [nameId, avatarId],
  fields: [
    { fieldId: nameId, before: value(nameId, "Name", "Ada", "a"), after: value(nameId, "Name", "Ada", "b") },
    {
      fieldId: avatarId,
      before: value(avatarId, "Avatar", null, "a"),
      after: value(avatarId, "Avatar", "https://example.test/ada.jpg", "a"),
    },
  ],
  assignments: null,
  identities: null,
  links: [],
} as RecordEventPayload;

const model = {
  types: [{ id: typeId, archived: false }],
  fields: [],
  capabilities: [{ kind: "avatar", typeId, fields: [{ role: "image", fieldId: avatarId }] }],
} as unknown as RecordModel;

const policy = {
  actor: { id: crypto.randomUUID() },
  isAdmin: true,
  allowed: () => true,
  canRead: () => Promise.resolve(true),
} as never;

const reader = new RecordHistoryReader({
  getRecordCompanyWide: () => Promise.resolve({ id: ref.recordId, typeId }),
  getRecordsCompanyWide: () => Promise.resolve([]),
} as unknown as RecordRepo);

describe("record history reader", () => {
  it("shows only fields whose value changed and marks the avatar picture", async () => {
    const changes = await reader.redact(payload, model, policy);

    expect(changes?.fields).toEqual([
      expect.objectContaining({ fieldId: avatarId, image: true, before: expect.objectContaining({ label: "Avatar" }) }),
    ]);
  });

  it("keeps metadata-only changes in deliveries", async () => {
    const changes = await reader.redact(payload, model, policy, "delivery");

    expect(changes?.fields.map((field) => field.fieldId)).toEqual([nameId, avatarId]);
  });

  it("keeps a field whose value stayed but whose earlier source this viewer cannot read", async () => {
    const hidden = { typeId, recordId: crypto.randomUUID() };
    const visible = { typeId, recordId: crypto.randomUUID() };
    const sourced = (source: typeof hidden): RecordHistoryValue => ({
      ...value(nameId, "Weighted value", "600", "a"),
      sources: [source],
    });
    const memberReader = new RecordHistoryReader({
      getRecordCompanyWide: () => Promise.resolve({ id: ref.recordId, typeId }),
      getRecordsCompanyWide: (refs: { recordId: string }[]) =>
        Promise.resolve(refs.map((source) => ({ id: source.recordId, typeId }))),
    } as unknown as RecordRepo);
    const member = {
      actor: { id: crypto.randomUUID() },
      isAdmin: false,
      allowed: () => true,
      canRead: (row: { id?: string }) => Promise.resolve(row.id !== hidden.recordId),
    } as never;

    const changes = await memberReader.redact(
      { ...payload, fields: [{ fieldId: nameId, before: sourced(hidden), after: sourced(visible) }] },
      model,
      member,
    );

    expect(changes?.fields).toEqual([
      expect.objectContaining({
        fieldId: nameId,
        before: expect.objectContaining({ value: { state: "restricted" } }),
        after: expect.objectContaining({ value: { state: "value", value: { kind: "text", value: "600" } } }),
      }),
    ]);
  });
});
