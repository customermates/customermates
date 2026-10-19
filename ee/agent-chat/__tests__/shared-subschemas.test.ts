import Ajv from "ajv";
import { describe, expect, it } from "vitest";

import { inlineSchemaDefinitions, shareRepeatedSubschemas } from "../shared-subschemas";

type JsonRecord = Record<string, unknown>;

describe("shared sub-schemas", () => {
  const source = {
    type: "object",
    description: "x".repeat(1_200),
    properties: { typeId: { type: "string" } },
    required: ["typeId"],
  };
  const document = {
    type: "object",
    properties: { measure: { type: "object", properties: { source } }, calendarQuery: source, mapQuery: source },
  };

  it("sends a large repeated sub-schema once and references it, and can put it back in place", () => {
    const shared = shareRepeatedSubschemas(document) as JsonRecord;
    expect(shared.definitions).toEqual({ shared1: source });
    expect((shared.properties as JsonRecord).mapQuery).toEqual({ $ref: "#/definitions/shared1" });
    expect(JSON.stringify(shared).length).toBeLessThan(JSON.stringify(document).length);
    expect(inlineSchemaDefinitions(shared)).toEqual(document);
    expect(new Ajv({ strict: false }).validate(shared, { measure: { source: { typeId: "a" } }, mapQuery: {} })).toBe(
      false,
    );
  });

  it("keeps small repeats and property names inline", () => {
    const small = { type: "string", pattern: "^x$" };
    const plain = { type: "object", properties: { a: small, b: small, properties: { type: "string" } } };
    expect(shareRepeatedSubschemas(plain)).toBe(plain);
  });
});
