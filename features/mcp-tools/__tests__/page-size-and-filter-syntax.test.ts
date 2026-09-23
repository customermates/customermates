import { describe, expect, it } from "vitest";
import { z } from "zod";

import { FilterOperatorKey } from "@/core/base/base-query-builder";

import {
  FILTER_FIELD_DESCRIPTION,
  FILTER_OPERATORS,
  FILTER_SYNTAX,
  mcpOptionalPageSize,
  mcpPageSize,
  roundMcpPageSize,
  nameMatchNote,
  nameQueryOf,
} from "../utils";

describe("page size", () => {
  it("lowers any 1-100 integer to the nearest supported size and applies the default", () => {
    expect(roundMcpPageSize(1)).toBe(5);
    expect(roundMcpPageSize(50)).toBe(25);
    expect(roundMcpPageSize(60)).toBe(25);
    expect(roundMcpPageSize(100)).toBe(100);
    expect(roundMcpPageSize(99)).toBe(25);
    expect(roundMcpPageSize(7)).toBe(5);
    expect(roundMcpPageSize(25)).toBe(25);
    const schema = z.object({ pageSize: mcpPageSize(25) });
    expect(schema.parse({}).pageSize).toBe(25);
    expect(schema.parse({ pageSize: "50" }).pageSize).toBe(25);
    expect(schema.parse({ pageSize: 3 }).pageSize).toBe(5);
    expect(schema.safeParse({ pageSize: 0 }).success).toBe(false);
    expect(schema.safeParse({ pageSize: 101 }).success).toBe(false);
    const optional = z.object({ pageSize: mcpOptionalPageSize("x") });
    expect(optional.parse({}).pageSize).toBeUndefined();
    expect(optional.parse({ pageSize: 12 }).pageSize).toBe(10);
  });

  it("advertises a plain bounded integer on the wire instead of a literal union", () => {
    const wire = z.toJSONSchema(z.object({ pageSize: mcpPageSize(25) }), { io: "input" }) as unknown as {
      properties: { pageSize: { type?: string; minimum?: number; maximum?: number; enum?: unknown } };
    };
    expect(wire.properties.pageSize).toMatchObject({ type: "integer", minimum: 1, maximum: 100 });
    expect(wire.properties.pageSize.enum).toBeUndefined();
  });
});

describe("filter syntax", () => {
  it("lists every filter operator the query builder supports, exactly once", () => {
    expect([...FILTER_OPERATORS].toSorted()).toEqual(Object.values(FilterOperatorKey).toSorted());
    expect(new Set(FILTER_OPERATORS).size).toBe(FILTER_OPERATORS.length);
    for (const operator of Object.values(FilterOperatorKey)) expect(FILTER_FIELD_DESCRIPTION).toContain(operator);
    expect(Object.values(FILTER_SYNTAX.operators).flat().toSorted()).toEqual(
      Object.values(FilterOperatorKey).toSorted(),
    );
  });

  it("stays compact enough to leave room for the schema it accompanies", () => {
    expect(JSON.stringify(FILTER_SYNTAX).length).toBeLessThan(700);
  });
});

describe("name match note", () => {
  it("says so when two or more listed names contain the searched name", () => {
    const note = nameMatchNote("Nova Expansion", [{ name: "Nova Expansion" }, { name: "Nova Expansion 2025" }]);
    expect(note).toContain('2 records here match the name "Nova Expansion"');
    expect(note).toContain("ask which one");
    expect(note).toContain("act on all of them");
  });

  it("stays silent for a single match, a short term, or no term", () => {
    expect(nameMatchNote("Nova Expansion", [{ name: "Nova Expansion" }, { name: "Kestrel" }])).toBeUndefined();
    expect(nameMatchNote("No", [{ name: "Nova" }, { name: "Nordwind" }])).toBeUndefined();
    expect(nameMatchNote(undefined, [{ name: "Nova" }, { name: "Nova" }])).toBeUndefined();
  });

  it("reads the name query from a search term or a name filter", () => {
    expect(nameQueryOf("Acme", undefined)).toBe("Acme");
    expect(nameQueryOf(undefined, [{ field: "name", operator: "startsWith", value: "Renewal" }])).toBe("Renewal");
    expect(nameQueryOf(undefined, [{ field: "status", operator: "in", value: ["x"] }])).toBeUndefined();
  });
});
