import { describe, expect, it } from "vitest";

import type { RecordField, RecordScalar } from "../record-model.schema";

import { CustomErrorCode } from "@/core/validation/validation.types";
import { failureUnwindCause } from "@/core/validation/failure-unwind";
import { recordValueIssue } from "../record-model-validation";
import { recordFieldErrors, recordValuesErrorTree } from "../record-mutation-failure";
import { normalizeRecordScalar } from "../record-write.service";

function field(valueType: RecordField["valueType"], overrides: Partial<RecordField> = {}): RecordField {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    typeId: "00000000-0000-4000-8000-000000000002",
    key: "value",
    label: "Value",
    description: null,
    valueType,
    multiple: false,
    required: false,
    archived: false,
    publishedSummary: false,
    behavior: { kind: "input" },
    options: [],
    position: 0,
    ...overrides,
  } as RecordField;
}

const text = (value: string): RecordScalar => ({ kind: "text", value });

function unwound(run: () => unknown) {
  try {
    run();
  } catch (error) {
    return failureUnwindCause(error);
  }
  throw new Error("Expected a failure");
}

describe("record value validation", () => {
  it.each([
    ["email", "bad-email", CustomErrorCode.invalidEmail],
    ["url", "not a url", CustomErrorCode.invalidUrl],
  ] as const)("names the specific %s failure", (valueType, value, code) => {
    expect(recordValueIssue(text(value), field(valueType))).toBe(code);
  });

  it("names number, date, range and option failures", () => {
    expect(recordValueIssue({ kind: "decimal", value: "1e400", currency: null }, field("number"))).toBe(
      CustomErrorCode.recordNumberInvalid,
    );
    expect(recordValueIssue(text("2026-01-01"), field("date"))).toBe(CustomErrorCode.recordDateInvalid);
    expect(recordValueIssue({ kind: "range", start: "2026-02-01", end: "2026-01-01" }, field("dateRange"))).toBe(
      CustomErrorCode.recordDateRangeInvalid,
    );
    expect(recordValueIssue({ kind: "select", value: "missing" }, field("select"))).toBe(
      CustomErrorCode.recordOptionInvalid,
    );
    expect(recordValueIssue({ kind: "boolean", value: true }, field("member"))).toBe(
      CustomErrorCode.recordValueTypeMismatch,
    );
  });

  it("fails a write with the field path and a specific code", () => {
    const path = ["mutation", "fields", 2, "value"];
    expect(unwound(() => normalizeRecordScalar(text("bad-email"), field("email"), path))).toMatchObject({
      code: CustomErrorCode.invalidEmail,
      path,
    });
    expect(unwound(() => normalizeRecordScalar(null, field("text", { required: true }), path))).toMatchObject({
      code: CustomErrorCode.recordValueRequired,
      path,
      values: { field: "Value" },
    });
  });

  it("maps mutation failures to the fields that were sent", () => {
    const errors = recordFieldErrors(
      {
        kind: "validation",
        issues: [
          { code: "custom", path: ["mutation", "fields", 1, "value"], message: "Enter a valid email address." },
          { code: "custom", path: ["mutation", "fields"], message: "Name needs a value." },
        ],
      },
      ["first", "second"],
    );
    expect(errors).toEqual({ errors: ["Name needs a value."], fields: { second: ["Enter a valid email address."] } });
    expect(recordValuesErrorTree(errors)).toEqual({
      errors: ["Name needs a value."],
      properties: { values: { errors: [], properties: { second: { errors: ["Enter a valid email address."] } } } },
    });
  });

  it("maps a refused assignee to the Assigned to field", () => {
    const message = "This member is inactive or not part of this workspace. Choose an active member.";
    const errors = recordFieldErrors(
      { kind: "validation", issues: [{ code: "custom", path: ["mutation", "assignedUserIds"], message }] },
      ["first"],
    );
    expect(errors).toEqual({ errors: [], fields: {}, assignees: [message] });
    expect(recordValuesErrorTree(errors)).toEqual({
      errors: [],
      properties: { values: { errors: [], properties: {} }, assignedUserIds: { errors: [message] } },
    });
  });
});
