import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { FilterOperatorKey } from "@/core/base/base-query-builder";

import {
  FILTER_FIELD_DESCRIPTION,
  FILTER_OPERATORS,
  FILTER_SYNTAX,
  MCP_PAGE_SIZE_DESCRIPTION,
  MCP_PAGE_SIZES,
  McpPageOutputShape,
  fetchMcpPage,
  mcpOptionalPageSize,
  mcpPageSize,
  planMcpPageFetch,
  nameMatchNote,
  nameQueryOf,
  type McpPageSize,
} from "../utils";

function backendOf(total: number) {
  const rows = Array.from({ length: total }, (_, index) => index);
  const calls: { page: number; pageSize: McpPageSize }[] = [];
  const fetchPage = (pagination: { page: number; pageSize: McpPageSize }) => {
    calls.push(pagination);
    const skip = (pagination.page - 1) * pagination.pageSize;
    return Promise.resolve({ ok: true as const, data: { items: rows.slice(skip, skip + pagination.pageSize), total } });
  };
  return { rows, calls, fetchPage };
}

describe("page size", () => {
  it("takes any 1-100 integer as it is and applies the default", () => {
    const schema = z.object({ pageSize: mcpPageSize(25) });
    expect(schema.parse({}).pageSize).toBe(25);
    expect(schema.parse({ pageSize: "50" }).pageSize).toBe(50);
    expect(schema.parse({ pageSize: 3 }).pageSize).toBe(3);
    expect(schema.parse({ pageSize: 100 }).pageSize).toBe(100);
    expect(schema.safeParse({ pageSize: 0 }).success).toBe(false);
    expect(schema.safeParse({ pageSize: 101 }).success).toBe(false);
    expect(schema.safeParse({ pageSize: 7.5 }).success).toBe(false);
    const optional = z.object({ pageSize: mcpOptionalPageSize("x") });
    expect(optional.parse({}).pageSize).toBeUndefined();
    expect(optional.parse({ pageSize: 12 }).pageSize).toBe(12);
  });

  it("says every size is served exactly and how pages count, in the tool and in the EN and DE docs", () => {
    const docs = (locale: string) =>
      readFileSync(join(process.cwd(), "content", "docs", locale, "mcp.mdx"), "utf8").replace(/\s+/g, " ");

    expect(MCP_PAGE_SIZE_DESCRIPTION).toContain("any whole number from 1 to 100, served exactly");
    expect(MCP_PAGE_SIZE_DESCRIPTION).toContain("page 2 of pageSize 50 holds records 51 to 100");
    expect(MCP_PAGE_SIZE_DESCRIPTION).toContain("ask again with about half the size");
    expect(McpPageOutputShape.pageSize.description).toContain("every page but the last holds exactly this many");
    expect(McpPageOutputShape.pageSize.description).not.toContain("group");
    for (const text of [MCP_PAGE_SIZE_DESCRIPTION, docs("en")]) expect(text).not.toMatch(/lowered|requestedPageSize/);
    expect(docs("de")).not.toMatch(/abgesenkt|requestedPageSize/);

    expect(docs("en")).toContain(
      "`pageSize` accepts any whole number from 1 to 100 and returns exactly that many records per page, fewer only on the last",
    );
    expect(docs("en")).toContain("page 2 at `pageSize` 50 holds records 51 to 100, and the result reports both");
    expect(docs("de")).toContain(
      "`pageSize` akzeptiert jede ganze Zahl von 1 bis 100 und liefert genau so viele Datensätze pro Seite, nur die letzte kann weniger enthalten",
    );
    expect(docs("de")).toContain(
      "Seite 2 bei `pageSize` 50 enthält also die Datensätze 51 bis 100, und das Ergebnis nennt beide",
    );
  });

  it("advertises a plain bounded integer on the wire instead of a literal union", () => {
    const wire = z.toJSONSchema(z.object({ pageSize: mcpPageSize(25) }), { io: "input" }) as unknown as {
      properties: { pageSize: { type?: string; minimum?: number; maximum?: number; enum?: unknown } };
    };
    expect(wire.properties.pageSize).toMatchObject({ type: "integer", minimum: 1, maximum: 100 });
    expect(wire.properties.pageSize.enum).toBeUndefined();
  });
});

describe("page window", () => {
  it("reads an offered size as the same page of that size", () => {
    for (const size of MCP_PAGE_SIZES) {
      for (let page = 1; page <= 40; page += 1)
        expect(planMcpPageFetch(page, size)).toEqual({ page, pageSize: size, offset: 0, spans: 1 });
    }
  });

  it("reads any other size from one or two pages of an offered size", () => {
    expect(planMcpPageFetch(1, 50)).toEqual({ page: 1, pageSize: 100, offset: 0, spans: 1 });
    expect(planMcpPageFetch(2, 50)).toEqual({ page: 1, pageSize: 100, offset: 50, spans: 1 });
    expect(planMcpPageFetch(3, 50)).toEqual({ page: 2, pageSize: 100, offset: 0, spans: 1 });
    expect(planMcpPageFetch(2, 60)).toEqual({ page: 1, pageSize: 100, offset: 60, spans: 2 });
    expect(planMcpPageFetch(3, 7)).toEqual({ page: 1, pageSize: 25, offset: 14, spans: 1 });
    expect(planMcpPageFetch(2, 20)).toEqual({ page: 1, pageSize: 100, offset: 20, spans: 1 });
  });

  it("never reads a backend page beyond the page asked for, so a page cap still holds", () => {
    const violations: string[] = [];
    for (let size = 1; size <= 100; size += 1) {
      for (let page = 1; page <= 45; page += 1) {
        const plan = planMcpPageFetch(page, size);
        if (!MCP_PAGE_SIZES.includes(plan.pageSize) || plan.pageSize < size || plan.page + plan.spans - 1 > page)
          violations.push(`${page}/${size}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("returns exactly the asked-for records and the total, for every small total, size and page", async () => {
    const mismatches: string[] = [];
    for (let total = 0; total <= 130; total += 1) {
      for (let size = 1; size <= 100; size += 1) {
        for (let page = 1; (page - 1) * size <= total; page += 1) {
          const backend = backendOf(total);
          const result = await fetchMcpPage({ page, pageSize: size }, backend.fetchPage);
          const plan = planMcpPageFetch(page, size);
          const firstFull = plan.page * plan.pageSize <= total;
          const expectedCalls = plan.spans === 2 && firstFull ? 2 : 1;
          const expected = backend.rows.slice((page - 1) * size, page * size);
          if (
            JSON.stringify(result.data.items) !== JSON.stringify(expected) ||
            result.data.total !== total ||
            backend.calls.length !== expectedCalls ||
            backend.calls.some((call) => !MCP_PAGE_SIZES.includes(call.pageSize))
          )
            mismatches.push(`total ${total}, page ${page} of ${size}`);
        }
      }
    }
    expect(mismatches).toEqual([]);
  });

  it("reads a second page only when the first one came back full", async () => {
    const full = backendOf(200);
    const short = backendOf(70);

    const joined = await fetchMcpPage({ page: 2, pageSize: 60 }, full.fetchPage);
    const tail = await fetchMcpPage({ page: 2, pageSize: 60 }, short.fetchPage);

    expect(full.calls).toEqual([
      { page: 1, pageSize: 100 },
      { page: 2, pageSize: 100 },
    ]);
    expect(joined.data.items).toEqual(full.rows.slice(60, 120));
    expect(short.calls).toEqual([{ page: 1, pageSize: 100 }]);
    expect(tail.data.items).toEqual(short.rows.slice(60, 70));
  });

  it("passes a failure of either read through unchanged", async () => {
    const error = new z.ZodError([]);
    const failing = vi.fn().mockResolvedValue({ ok: false, error });
    const secondFails = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, data: { items: Array.from({ length: 100 }, (_, index) => index) } })
      .mockResolvedValueOnce({ ok: false, error });

    await expect(fetchMcpPage({ page: 2, pageSize: 60 }, failing)).resolves.toEqual({ ok: false, error });
    expect(failing).toHaveBeenCalledTimes(1);
    await expect(fetchMcpPage({ page: 2, pageSize: 60 }, secondFails)).resolves.toEqual({ ok: false, error });
    expect(secondFails).toHaveBeenCalledTimes(2);
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

  it("teaches single-select filters as in with option ids, the only shape those columns accept", () => {
    expect(FILTER_SYNTAX.examples).toContainEqual({
      field: "<single-select-custom-column-uuid>",
      operator: "in",
      value: ["<option-uuid>"],
    });
    expect(FILTER_SYNTAX.examples.some((example) => example.operator === "equals")).toBe(false);
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
