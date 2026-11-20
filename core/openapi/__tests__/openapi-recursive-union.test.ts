import { describe, expect, it } from "vitest";

import { generateOpenApiSpec } from "@/core/openapi/openapi-spec";

type Schema = Record<string, unknown>;

const PREFIX = "#/components/schemas/";
const UNION_KEYS = ["anyOf", "oneOf", "allOf"] as const;

function renderedNames(node: unknown, found = new Set<string>()): Set<string> {
  if (node === null || typeof node !== "object" || Array.isArray(node)) return found;
  const schema = node as Schema;
  if (typeof schema.$ref === "string") {
    if (schema.$ref.startsWith(PREFIX)) found.add(schema.$ref.slice(PREFIX.length));
    return found;
  }
  for (const key of UNION_KEYS) {
    const members = schema[key];
    if (Array.isArray(members)) for (const member of members) renderedNames(member, found);
  }
  if (schema.type === "array") renderedNames(schema.items, found);
  return found;
}

function reachesItselfWithoutAnObject(name: string, schemas: Record<string, Schema>): boolean {
  const seen = new Set<string>();
  const queue = [...renderedNames(schemas[name])];
  while (queue.length > 0) {
    const next = queue.pop();
    if (next === undefined || seen.has(next)) continue;
    if (next === name) return true;
    seen.add(next);
    queue.push(...renderedNames(schemas[next]));
  }
  return false;
}

function recursiveUnions(schemas: Record<string, Schema>): string[] {
  return Object.keys(schemas).filter((name) => reachesItselfWithoutAnObject(name, schemas));
}

const schemas: Record<string, Schema> =
  (generateOpenApiSpec() as { components?: { schemas?: Record<string, Schema> } }).components?.schemas ?? {};

describe("generated OpenAPI component schemas", () => {
  it("has no union or array that contains itself without an object in between, which overflows the REST reference page renderer", () => {
    expect(recursiveUnions(schemas)).toEqual([]);
  });

  it("names no generated placeholder component, which z.json() and other recursive helpers leave behind", () => {
    expect(Object.keys(schemas).filter((name) => name.startsWith("__schema"))).toEqual([]);
  });

  it("detects a union that reaches itself through an array and allows a tree that recurses through an object", () => {
    const fixture: Record<string, Schema> = {
      Json: {
        anyOf: [{ type: "string" }, { type: "array", items: { $ref: `${PREFIX}Json` } }],
      },
      Tree: { type: "object", properties: { child: { $ref: `${PREFIX}Tree` } } },
      Expression: {
        anyOf: [{ $ref: `${PREFIX}Sum` }, { type: "number" }],
      },
      Sum: { type: "object", properties: { terms: { type: "array", items: { $ref: `${PREFIX}Expression` } } } },
    };

    expect(recursiveUnions(fixture)).toEqual(["Json"]);
  });
});
