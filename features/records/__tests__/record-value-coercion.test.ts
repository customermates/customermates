import { describe, expect, it } from "vitest";

import type { AnswerField } from "../record-value-coercion";

import { coerceAnswers, convertField, hasTextValue, isAnswerableField } from "../record-value-coercion";

const TYPE_ID = "00000000-0000-4000-8000-0000000000b1";
const OTHER_TYPE_ID = "00000000-0000-4000-8000-0000000000b2";
const FIELD_ID = "00000000-0000-4000-8000-0000000000e0";

function field(valueType: string, overrides: Partial<AnswerField> = {}): AnswerField {
  return {
    id: FIELD_ID,
    typeId: TYPE_ID,
    valueType,
    required: false,
    multiple: undefined,
    options: [],
    format: undefined,
    archived: false,
    behavior: { kind: "input" },
    ...overrides,
  } as AnswerField;
}

const SELECT = field("select", {
  options: [
    { id: "web", label: "Website", color: null, attributes: [] },
    { id: "event", label: "Event", color: null, attributes: [] },
  ],
});

describe("convertField", () => {
  it("trims text and rejects an answer over the length cap", () => {
    expect(convertField(field("text"), "  Ada ")).toEqual({
      kind: "value",
      value: { kind: "text", value: "Ada" },
      display: "Ada",
    });
    expect(convertField(field("text"), "   ")).toEqual({ kind: "skip" });
    expect(convertField(field("text"), "a".repeat(5_000)).kind).toBe("value");
    expect(convertField(field("text"), "a".repeat(5_001))).toEqual({ kind: "error", error: "invalid" });
    expect(convertField(field("richText"), "a".repeat(10_000)).kind).toBe("value");
    expect(convertField(field("richText"), "a".repeat(10_001))).toEqual({ kind: "error", error: "invalid" });
  });

  it("turns formatted text into a document with one paragraph per line", () => {
    expect(convertField(field("richText"), "One\n\nTwo")).toMatchObject({
      kind: "value",
      value: {
        kind: "richText",
        documentJson: JSON.stringify({
          type: "doc",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "One" }] },
            { type: "paragraph", content: [{ type: "text", text: "Two" }] },
          ],
        }),
      },
    });
  });

  it("accepts only calendar dates", () => {
    expect(convertField(field("date"), "2026-11-16")).toMatchObject({ kind: "value", value: { kind: "date" } });
    expect(convertField(field("date"), "2026-02-30")).toEqual({ kind: "error", error: "invalid" });
    expect(convertField(field("date"), "16.11.2026")).toEqual({ kind: "error", error: "invalid" });
    expect(convertField(field("date"), "")).toEqual({ kind: "skip" });
  });

  it("accepts only http and https addresses for a link field", () => {
    expect(convertField(field("url"), "https://example.com/a")).toMatchObject({ kind: "value" });
    expect(convertField(field("url"), "javascript:alert(1)")).toEqual({ kind: "error", error: "invalid" });
    expect(convertField(field("url"), "example.com")).toEqual({ kind: "error", error: "invalid" });
    expect(convertField(field("url"), `https://example.com/${"a".repeat(2_000)}`)).toEqual({
      kind: "error",
      error: "invalid",
    });
  });

  it("reads numbers with a decimal comma and rejects anything else", () => {
    expect(convertField(field("number"), "12,5")).toMatchObject({ value: { kind: "decimal", value: "12.5" } });
    expect(convertField(field("currency", { format: { currency: "EUR" } }), "9")).toMatchObject({
      value: { kind: "decimal", value: "9", currency: "EUR" },
    });
    expect(convertField(field("number"), "twelve")).toEqual({ kind: "error", error: "invalid" });
    expect(convertField(field("number"), "1".repeat(41))).toEqual({ kind: "error", error: "invalid" });
  });

  it("reads yes and no from a flag or its text", () => {
    expect(convertField(field("boolean"), true)).toMatchObject({ value: { kind: "boolean", value: true } });
    expect(convertField(field("boolean"), "false")).toMatchObject({ value: { kind: "boolean", value: false } });
    expect(convertField(field("boolean"), undefined)).toEqual({ kind: "skip" });
  });

  it("matches a choice by option id and shows its label", () => {
    expect(convertField(SELECT, "web")).toEqual({
      kind: "value",
      value: { kind: "select", value: "web" },
      display: "Website",
    });
    expect(convertField(SELECT, "unknown")).toEqual({ kind: "error", error: "invalid" });
    expect(convertField({ ...SELECT, multiple: true }, ["web", "event", "web"])).toEqual({
      kind: "value",
      value: { kind: "selectList", value: ["web", "event"] },
      display: "Website, Event",
    });
    expect(convertField({ ...SELECT, multiple: true }, ["web", "nope"])).toEqual({ kind: "error", error: "invalid" });
  });

  it("turns contact details into a mail identity and names a bad address as an email error", () => {
    expect(convertField(field("channels"), " Ada@Example.COM ")).toEqual({
      kind: "identity",
      identity: { provider: "mail", value: "ada@example.com" },
      display: "ada@example.com",
    });
    expect(convertField(field("channels"), "not an email")).toEqual({ kind: "error", error: "email" });
  });
});

describe("isAnswerableField", () => {
  it("accepts input fields of the supported types, a choice also as multiple", () => {
    expect(isAnswerableField(field("text"))).toBe(true);
    expect(isAnswerableField(field("channels"))).toBe(true);
    expect(isAnswerableField({ ...SELECT, multiple: true })).toBe(true);
  });

  it("rejects archived, calculated, unsupported and multiple-value text fields", () => {
    expect(isAnswerableField(field("text", { archived: true }))).toBe(false);
    expect(isAnswerableField(field("text", { behavior: { kind: "formula" } }))).toBe(false);
    expect(isAnswerableField(field("file"))).toBe(false);
    expect(isAnswerableField(field("text", { multiple: true }))).toBe(false);
  });
});

describe("coerceAnswers", () => {
  const name = field("text", { id: "00000000-0000-4000-8000-000000000001", required: true });
  const agreed = field("boolean", { id: "00000000-0000-4000-8000-000000000002" });
  const contact = field("channels", { id: "00000000-0000-4000-8000-000000000003" });
  const other = field("text", { id: "00000000-0000-4000-8000-000000000004", typeId: OTHER_TYPE_ID });
  const fields = [name, agreed, contact, other];

  it("collects typed values, identities and the text to show for each answer", () => {
    const result = coerceAnswers(
      [
        { fieldId: name.id, required: false },
        { fieldId: agreed.id, required: false },
        { fieldId: contact.id, required: false },
      ],
      TYPE_ID,
      fields,
      { [name.id]: "Ada", [agreed.id]: true, [contact.id]: "ada@example.com" },
    );

    expect(result).toEqual({
      errors: {},
      fields: [
        { fieldId: name.id, value: { kind: "text", value: "Ada" } },
        { fieldId: agreed.id, value: { kind: "boolean", value: true } },
      ],
      identities: [{ provider: "mail", value: "ada@example.com" }],
      display: { [name.id]: "Ada", [agreed.id]: "true", [contact.id]: "ada@example.com" },
    });
  });

  it("requires what the entry or the list marks as required and treats an unchecked required box as missing", () => {
    const result = coerceAnswers(
      [
        { fieldId: name.id, required: false },
        { fieldId: agreed.id, required: true },
      ],
      TYPE_ID,
      fields,
      { [name.id]: " ", [agreed.id]: false },
    );

    expect(result.errors).toEqual({ [name.id]: "required", [agreed.id]: "required" });
  });

  it("names a value that does not fit its field and skips fields of another list or no longer usable", () => {
    const result = coerceAnswers(
      [
        { fieldId: contact.id, required: false },
        { fieldId: other.id, required: true },
        { fieldId: "00000000-0000-4000-8000-0000000000ff", required: true },
      ],
      TYPE_ID,
      [...fields, { ...agreed, archived: true }],
      { [contact.id]: "nope", [other.id]: "x" },
    );

    expect(result.errors).toEqual({ [contact.id]: "email" });
    expect(result.fields).toEqual([]);
  });
});

describe("hasTextValue", () => {
  it("is true only for text with a visible character", () => {
    expect(hasTextValue(" a ")).toBe(true);
    expect(hasTextValue("   ")).toBe(false);
    expect(hasTextValue(3)).toBe(false);
  });
});
