import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createCrmPreset, presetId } from "../crm-preset";
import { decodeLegacyRecordHistory, legacyRecordReference } from "../legacy-record-history";

describe("read-only legacy record history", () => {
  const companyId = randomUUID();
  const entityId = randomUUID();
  const id = (key: string) => presetId(companyId, key);
  const model = createCrmPreset(companyId, "EUR");
  const decode = (event: string, payload: unknown, isAdmin = true) =>
    decodeLegacyRecordHistory({
      companyId,
      entityId,
      event,
      eventData: { payload },
      model,
      currency: "EUR",
      isAdmin,
      archivedFieldLabel: "Archived field",
    });

  it("preserves identities across legacy tables and rejects non-record events", () => {
    expect(legacyRecordReference(companyId, "deal.created", entityId)).toEqual({
      typeId: id("deal"),
      recordId: entityId,
    });
    expect(legacyRecordReference(companyId, "contact.created", entityId)?.typeId).not.toBe(id("deal"));
    expect(legacyRecordReference(companyId, "company.updated", entityId)).toBeNull();
    expect(legacyRecordReference(companyId, "deal.created", "invalid")).toBeNull();
  });

  it("decodes creation, updates and deletion without mutating stored payloads", () => {
    const notes = { root: { type: "root", children: [], version: 1 } };
    const payload = { name: "Original", amount: 123.45, notes, secret: "excluded", unknown: { nested: "excluded" } };
    const copy = structuredClone(payload);
    const created = decode("service.created", payload);
    expect(created?.changes.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fieldId: id("service.amount"),
          before: null,
          after: expect.objectContaining({
            value: { state: "value", value: { kind: "decimal", value: "123.45", currency: "EUR" } },
          }),
        }),
        expect.objectContaining({
          fieldId: id("service.notes"),
          after: expect.objectContaining({
            value: { state: "value", value: { kind: "richText", documentJson: JSON.stringify(notes) } },
          }),
        }),
      ]),
    );
    expect(JSON.stringify(created)).not.toContain("excluded");
    expect(decode("service.deleted", payload)?.changes.fields.every((field) => field.after === null)).toBe(true);
    expect(
      decode("service.updated", { changes: { amount: { previous: 0, current: -0.125 } } })?.changes.fields[0],
    ).toMatchObject({
      before: { value: { value: { value: "0" } } },
      after: { value: { value: { value: "-0.125" } } },
    });
    expect(payload).toEqual(copy);
  });

  it("marks unprovable historical calculations restricted and invalid numbers as errors", () => {
    const value = decode("deal.created", { name: "Deal", totalValue: 500, weightedValue: 0 }, false);
    expect(
      value?.changes.fields
        .filter((field) => field.fieldId !== id("deal.name"))
        .every((field) => field.after?.value.state === "restricted"),
    ).toBe(true);
    expect(decode("service.created", { amount: "invalid" })?.changes.fields[0].after?.value).toEqual({
      state: "error",
      code: "type_mismatch",
    });
    expect(decode("service.updated", { changes: null, amount: null })?.changes.fields).toEqual([]);
  });

  it("keeps archived custom values and historical relationship names separate from permission checks", () => {
    const fieldId = randomUUID();
    const contactId = randomUUID();
    const entry = decode("deal.updated", {
      changes: {
        contacts: {
          previous: [],
          current: [{ id: contactId, firstName: "Old", lastName: "Name", secret: "excluded" }],
        },
        customFieldValues: {
          previous: [{ columnId: fieldId, value: "old" }],
          current: [{ columnId: fieldId, value: "new" }],
        },
      },
    });
    expect(entry?.changes.fields[0]).toMatchObject({
      fieldId,
      before: { label: "Archived field", value: { value: { value: "old" } } },
      after: { value: { value: { value: "new" } } },
    });
    expect(entry?.related).toEqual([
      {
        label: "Contacts",
        before: [],
        after: [{ ref: { typeId: id("contact"), recordId: contactId }, title: "Old Name" }],
      },
    ]);
    expect(JSON.stringify(entry)).not.toContain("excluded");
  });
});
