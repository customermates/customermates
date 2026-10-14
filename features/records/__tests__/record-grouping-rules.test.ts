import type { RecordField } from "../record-model.schema";

import { describe, expect, it } from "vitest";

import { resolveRecordGrouping } from "../record-grouping";
import { isRecordMeasureGroupField } from "../record-measure-validation";
import { isRecordSortField } from "../record-query-validation";

const TYPE_ID = "10000000-0000-4000-8000-000000000001";

function field(id: string, valueType: RecordField["valueType"], multiple = false): RecordField {
  return { id, typeId: TYPE_ID, valueType, multiple, archived: false } as RecordField;
}

const channels = field("20000000-0000-4000-8000-000000000001", "channels");
const stage = field("20000000-0000-4000-8000-000000000002", "select");
const tags = field("20000000-0000-4000-8000-000000000003", "select", true);
const title = field("20000000-0000-4000-8000-000000000004", "text");
const notes = field("20000000-0000-4000-8000-000000000005", "richText");

describe("group-by and sort rules shared by the server and the pickers", () => {
  it("never offers the Channels field as a widget group-by and keeps the scalar fields", () => {
    expect(isRecordMeasureGroupField(channels)).toBe(false);
    expect(isRecordMeasureGroupField(notes)).toBe(false);
    expect(isRecordMeasureGroupField({ ...stage, archived: true })).toBe(false);
    expect([stage, tags, title].every(isRecordMeasureGroupField)).toBe(true);
  });

  it("never resolves the Channels field as a data view grouping", () => {
    const model = {
      types: [{ id: TYPE_ID, relationshipPaths: [] }],
      relationships: [],
      fields: [channels, stage],
    } as never;
    expect(resolveRecordGrouping(TYPE_ID, { field: channels.id }, model)).toBeNull();
    expect(resolveRecordGrouping(TYPE_ID, { field: stage.id }, model)?.kind).toBe("customSingleSelect");
  });

  it("never offers the Channels field or a multiple choice as a sort", () => {
    expect(isRecordSortField(channels)).toBe(false);
    expect(isRecordSortField(tags)).toBe(false);
    expect(isRecordSortField(notes)).toBe(false);
    expect([stage, title].every(isRecordSortField)).toBe(true);
  });

  it("never groups a list by a multiple choice field, so a record never needs to sit in several groups", () => {
    const model = {
      types: [{ id: TYPE_ID, relationshipPaths: [] }],
      relationships: [],
      fields: [stage, tags],
    } as never;
    expect(resolveRecordGrouping(TYPE_ID, { field: tags.id }, model)).toBeNull();
    expect(resolveRecordGrouping(TYPE_ID, { field: stage.id }, model)?.kind).toBe("customSingleSelect");
  });
});
