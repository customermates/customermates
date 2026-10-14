import { describe, expect, it } from "vitest";

import { changedFieldsOf, isRecordChangeEvent } from "@/ee/routines/routine-event-filter";

describe("record events", () => {
  it("recognises the record event that carries changed fields", () => {
    expect(isRecordChangeEvent("record.updated")).toBe(true);
    expect(isRecordChangeEvent("record.created")).toBe(false);
    expect(isRecordChangeEvent("organization.updated")).toBe(false);
    expect(isRecordChangeEvent("messaging.chat.updated")).toBe(false);
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
