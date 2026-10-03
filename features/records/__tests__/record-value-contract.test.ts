import { describe, expect, it } from "vitest";
import { z } from "zod";
import Ajv from "ajv";
import { RecordScalarSchema } from "../record-model.schema";

describe("typed record value boundary", () => {
  it.each([
    { kind: "text", value: "A" },
    { kind: "textList", value: ["a", "b"] },
    { kind: "decimal", value: "-1000.005", currency: "EUR" },
    { kind: "decimal", value: "0", currency: null },
    { kind: "boolean", value: false },
    { kind: "date", value: "2024-02-29" },
    { kind: "dateTime", value: "2026-09-28T10:00:00.123456+02:00" },
    { kind: "range", start: null, end: "2026-09-28" },
    { kind: "select", value: "option-1" },
    { kind: "member", value: "11111111-1111-4111-8111-111111111111" },
    { kind: "richText", documentJson: '{"type":"doc","content":[]}' },
  ])("preserves every supported typed value exactly: $kind", (value) => {
    expect(RecordScalarSchema.parse(value)).toEqual(value);
  });
  it.each([
    { kind: "text", value: true },
    { kind: "textList", value: [] },
    { kind: "text", value: "A", currency: null },
    { kind: "decimal", value: "1.2e5", currency: "EUR" },
    { kind: "decimal", value: "100.00" },
    { kind: "decimal", value: 100, currency: "EUR" },
    { kind: "boolean", value: "false" },
    { kind: "date", value: "2025-02-29" },
    { kind: "dateTime", value: "2026-09-28T25:00:00Z" },
    { kind: "dateTime", value: "2026-09-28T10:00:00.1234567Z" },
    { kind: "range", start: null },
    { kind: "select", value: "" },
    { kind: "member", value: "11111111----4111-8111-1111111111111111" },
    { kind: "richText", value: "not a document" },
    { kind: "text", value: "A", companyId: "other" },
  ])("rejects mismatched, lossy or cross-kind inputs: %j", (value) => {
    expect(RecordScalarSchema.safeParse(value).success).toBe(false);
  });
  it("keeps the discovery schema bounded while the application checks discriminator semantics", () => {
    const input = z.toJSONSchema(RecordScalarSchema, { io: "input", target: "draft-07" });
    expect(JSON.stringify(input).length).toBeLessThan(1100);
    const wire = new Ajv().compile(input);
    const malformed = { kind: "decimal", value: "NaN", currency: "EUR" };
    expect(wire(malformed)).toBe(true);
    expect(RecordScalarSchema.safeParse(malformed).success).toBe(false);
  });
});
