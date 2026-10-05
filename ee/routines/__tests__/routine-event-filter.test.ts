import { describe, expect, it } from "vitest";

import { changedFieldsOf, isRecordChangeEvent, isRecordRemovalEvent } from "@/ee/routines/routine-event-filter";

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

    expect(changedFieldsOf(eventData)).toEqual([]);
    expect(changedFieldsOf(null)).toEqual([]);
    expect(changedFieldsOf({ payload: { id: "1" } })).toEqual([]);
  });
});
