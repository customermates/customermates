import { describe, expect, it } from "vitest";

import type { RecordField, RecordScalar } from "../record-model.schema";

import { CustomErrorCode } from "@/core/validation/validation.types";
import { failureUnwindCause } from "@/core/validation/failure-unwind";
import { normalizePhoneNumber, normalizeRecordInput, recordValueIssue } from "../record-model-validation";
import { recordFieldErrors, recordValuesErrorTree } from "../record-mutation-failure";
import { normalizeRecordScalar } from "../record-write.service";
import { recordInputValue } from "../record-input-value";

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
    ["phone", "030 1234567", CustomErrorCode.invalidPhone],
  ] as const)("names the specific %s failure", (valueType, value, code) => {
    expect(recordValueIssue(normalizeRecordInput(text(value), valueType), field(valueType))).toBe(code);
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

  it.each([
    ["+49 30 1234567", "+49301234567"],
    ["+49 (30) 123-45.67", "+49301234567"],
    ["0049 30 1234567", "+49301234567"],
    [" +1 (415) 555-0100 ", "+14155550100"],
  ])("normalises the phone number %s", (input, expected) => {
    expect(normalizePhoneNumber(input)).toBe(expected);
    expect(recordValueIssue(normalizeRecordInput(text(input), "phone"), field("phone"))).toBeNull();
  });

  it("stores the normalised phone number from every writer", () => {
    expect(normalizeRecordScalar(text("+49 30 1234567"), field("phone"))).toEqual(text("+49301234567"));
    expect(
      normalizeRecordScalar(
        { kind: "textList", value: ["+49 30 1234567", "+44 20 7946 0000"] },
        field("phone", { multiple: true }),
      ),
    ).toEqual({ kind: "textList", value: ["+49301234567", "+442079460000"] });
    expect(recordInputValue("+49 30 1234567", field("phone") as never)).toEqual(text("+49301234567"));
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
});
