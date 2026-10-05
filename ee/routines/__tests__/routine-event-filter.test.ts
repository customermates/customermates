import { describe, expect, it } from "vitest";

import {
  carriesChangedFields,
  changedFieldsOf,
  isRecordChangeEvent,
  isRecordRemovalEvent,
  matchesChangedFields,
} from "@/ee/routines/routine-event-filter";

describe("record events", () => {
  it("recognises the record event that carries changed fields", () => {
    expect(isRecordChangeEvent("record.updated")).toBe(true);
    expect(isRecordChangeEvent("record.created")).toBe(false);
    expect(isRecordChangeEvent("organization.updated")).toBe(false);
    expect(isRecordChangeEvent("messaging.chat.updated")).toBe(false);
  });

  it("recognises the record event whose record is already gone", () => {
    expect(isRecordRemovalEvent("record.deleted")).toBe(true);
    expect(isRecordRemovalEvent("deal.deleted")).toBe(false);
  });
});

describe("changed field extraction", () => {
  it("reads changed fields only from record event envelopes", () => {
    const eventData = { payload: { changes: { firstName: { previous: "A", current: "B" } } } };

    expect(carriesChangedFields(eventData)).toBe(false);
    expect(changedFieldsOf(eventData)).toEqual([]);
    expect(carriesChangedFields(null)).toBe(false);
    expect(changedFieldsOf({ payload: { id: "1" } })).toEqual([]);
  });
});

describe("changed field matching", () => {
  it("passes everything through when no fields are required", () => {
    expect(matchesChangedFields([], ["anything"])).toBe(true);
    expect(matchesChangedFields([], [])).toBe(true);
  });

  it("matches when any required field changed", () => {
    expect(matchesChangedFields(["stage", "amount"], ["amount"])).toBe(true);
  });

  it("rejects an update that touched only other fields", () => {
    expect(matchesChangedFields(["stage"], ["firstName", "lastName"])).toBe(false);
  });

  it("rejects an update that reported no changes at all", () => {
    expect(matchesChangedFields(["stage"], [])).toBe(false);
  });

  it("matches a custom column by its identifier", () => {
    expect(matchesChangedFields(["cf_renewal"], ["cf_renewal"])).toBe(true);
  });
});
