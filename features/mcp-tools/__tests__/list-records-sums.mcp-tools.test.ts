import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, it, expect, vi } from "vitest";

import { CONTENT_LOCALES } from "@/i18n/locale-registry";
import { createMockUser } from "@/tests/helpers/mock-user";
import { MOCK_ENV_MODULE, createMockDiModule, MOCK_ZOD_MODULE } from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();

const spies = vi.hoisted(() => ({ listDeals: vi.fn() }));

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/features/search/entity-list-executors", () => ({
  entityListExecutors: { deal: spies.listDeals },
  entityNameExtractors: { deal: (item: { name: string }) => item.name },
}));

import { listRecordsTool } from "../entity-generic.mcp-tools";

function listDeals(input: Record<string, unknown> = {}) {
  return listRecordsTool.execute(listRecordsTool.inputSchema.parse({ entity: "deal", ...input }));
}

describe("list_records numeric totals", () => {
  it("reports totals for every matching deal, not the returned page", async () => {
    spies.listDeals.mockResolvedValue({
      ok: true,
      data: {
        items: [{ id: "d1", name: "Rollout", totalValue: 342000, totalQuantity: 1050, weightedValue: 102600 }],
        pagination: { total: 10 },
        valueSums: { totalValue: 1965900, weightedValue: 763150 },
      },
    });

    const output = await listDeals();
    const text = typeof output === "string" ? output : JSON.stringify(output);

    expect(text).toContain("1965900");
    expect(text).toContain("763150");
    expect(text).toContain("sums");
    expect(text).toContain("102600");
  });

  it("omits sums for an entity that declares no numeric columns", async () => {
    spies.listDeals.mockResolvedValue({
      ok: true,
      data: { items: [{ id: "d1", name: "Rollout" }], pagination: { total: 1 } },
    });

    const output = await listDeals();
    const text = typeof output === "string" ? output : JSON.stringify(output);

    expect(text).not.toContain("sums");
  });

  it("serves a page size between the offered ones exactly, counting pages in that size", async () => {
    const deals = Array.from({ length: 250 }, (_, index) => ({ id: `d${index + 1}`, name: `Deal-${index + 1}` }));
    spies.listDeals.mockImplementation(({ pagination }: { pagination: { page: number; pageSize: number } }) =>
      Promise.resolve({
        ok: true,
        data: {
          items: deals.slice((pagination.page - 1) * pagination.pageSize, pagination.page * pagination.pageSize),
          pagination: { total: deals.length },
        },
      }),
    );
    const list = async (args: Record<string, unknown>) => {
      const result: unknown = await listRecordsTool.execute(
        listRecordsTool.inputSchema.parse({ entity: "deal", ...args }),
      );
      return (result as { structuredContent: { page: number; pageSize: number; items: { id: string }[] } })
        .structuredContent;
    };
    const ids = (from: number, to: number) => deals.slice(from, to).map((deal) => deal.id);

    spies.listDeals.mockClear();
    const fifty = await list({ pageSize: 50 });
    expect(spies.listDeals.mock.calls.map(([params]) => params.pagination)).toEqual([{ page: 1, pageSize: 100 }]);
    expect(fifty).toMatchObject({ total: 250, page: 1, pageSize: 50 });
    expect(fifty.items.map((item) => item.id)).toEqual(ids(0, 50));
    expect(JSON.stringify(fifty)).not.toMatch(/requestedPageSize|pageSizeNote/);

    spies.listDeals.mockClear();
    const sixty = await list({ page: 2, pageSize: 60 });
    expect(spies.listDeals.mock.calls.map(([params]) => params.pagination)).toEqual([
      { page: 1, pageSize: 100 },
      { page: 2, pageSize: 100 },
    ]);
    expect(sixty).toMatchObject({ total: 250, page: 2, pageSize: 60 });
    expect(sixty.items.map((item) => item.id)).toEqual(ids(60, 120));

    spies.listDeals.mockClear();
    const ten = await list({ page: 3, pageSize: 10 });
    expect(spies.listDeals.mock.calls.map(([params]) => params.pagination)).toEqual([{ page: 3, pageSize: 10 }]);
    expect(ten.items.map((item) => item.id)).toEqual(ids(20, 30));
  });

  it("claims only totalValue and weightedValue as deal sums, while deal items still carry totalQuantity", () => {
    const sumsClaims = [
      listRecordsTool.description.match(/For deals sums holds[^.]*\./)?.[0],
      ...CONTENT_LOCALES.map(
        (locale) =>
          readFileSync(join(process.cwd(), "content", "docs", locale, "mcp.mdx"), "utf8").match(
            /`sums` [^.]*`totalValue`[^.]*\./,
          )?.[0],
      ),
    ];

    expect(sumsClaims).toHaveLength(CONTENT_LOCALES.length + 1);
    for (const claim of sumsClaims) {
      expect(claim).toMatch(/totalValue.*weightedValue/);
      expect(claim).not.toContain("totalQuantity");
    }
    expect(listRecordsTool.description).toContain("deal items add totalValue, totalQuantity and weightedValue");
  });

  it("names what sums covers and says service amount and deal totalQuantity are not in it, as the EN and DE docs do", () => {
    expect(listRecordsTool.description).toContain("For deals and custom currency columns it also returns sums");
    expect(listRecordsTool.description).toContain("Service amount and deal totalQuantity are not in sums");
    expect(listRecordsTool.description).not.toContain("numeric columns");
    const docs = (locale: string) =>
      readFileSync(join(process.cwd(), "content", "docs", locale, "mcp.mdx"), "utf8").replace(/\s+/g, " ");
    expect(docs("en")).toContain("returns `total` and, for deals and custom currency columns, `sums` before the items");
    expect(docs("de")).toContain(
      "liefert `total` und, bei Deals und Custom Columns vom Typ Währung, `sums` vor den Elementen",
    );
  });

  it("tells an agent the totals span the filters rather than the page", () => {
    expect(listRecordsTool.description).toContain("not just the current page");
    expect(listRecordsTool.description).toContain("weightedValue");
    expect(listRecordsTool.description).toMatch(/single-select[^.]*not/i);
  });

  it("puts ambiguous write guidance next to multi-match search results", async () => {
    spies.listDeals.mockResolvedValue({
      ok: true,
      data: {
        items: [
          { id: "d1", name: "Nova Expansion", totalValue: 24_000 },
          { id: "d2", name: "Nova Expansion 2025", totalValue: 18_000 },
        ],
        pagination: { total: 2 },
      },
    });

    const output = await listDeals({ searchTerm: "Nova Expansion" });
    expect(output).toMatchObject({
      structuredContent: {
        writeTargetGuidance: {
          status: "ambiguous",
          reason: "multiple_search_matches",
          returnedCandidateCount: 2,
        },
        items: [
          { id: "d1", name: "Nova Expansion", totalValue: 24_000 },
          { id: "d2", name: "Nova Expansion 2025", totalValue: 18_000 },
        ],
      },
    });
    if (typeof output === "string" || !("structuredContent" in output))
      throw new Error("Expected a structured MCP result");
    expect(listRecordsTool.outputSchema.safeParse(output.structuredContent).success).toBe(true);
    expect(output).not.toHaveProperty("structuredContent.writeTargetGuidance.instruction");
    expect(output).not.toHaveProperty("structuredContent.writeTargetGuidance.candidates");
    expect(output).not.toHaveProperty("structuredContent.nameMatchNote");
    const text = typeof output === "string" ? output : output.text;
    expect(text).not.toContain("Do not change");
    expect(text).not.toContain("nameMatchNote");
    expect(text).not.toMatch(/\bask\b/i);
    expect(listRecordsTool.outputSchema.shape).not.toHaveProperty("nameMatchNote");
    expect(listRecordsTool.description).toContain("exactly equals the search term");
  });

  it("gives a name filter that matches several records the same guidance as a search", async () => {
    spies.listDeals.mockResolvedValue({
      ok: true,
      data: {
        items: [
          { id: "d1", name: "Nova Expansion" },
          { id: "d2", name: "Nova Expansion 2025" },
        ],
        pagination: { total: 2 },
      },
    });

    const output = await listDeals({ filters: [{ field: "name", operator: "startsWith", value: "Nova Expansion" }] });
    expect(output).toMatchObject({
      structuredContent: {
        writeTargetGuidance: { status: "ambiguous", reason: "multiple_search_matches", returnedCandidateCount: 2 },
      },
    });
    expect(output).not.toHaveProperty("structuredContent.nameMatchNote");
  });

  it("gives no guidance to a filter on another field that matches several records", async () => {
    spies.listDeals.mockResolvedValue({
      ok: true,
      data: {
        items: [
          { id: "d1", name: "Nova Expansion" },
          { id: "d2", name: "Nova Expansion 2025" },
        ],
        pagination: { total: 2 },
      },
    });

    const output = await listDeals({ filters: [{ field: "createdAt", operator: "inLastDays", value: 30 }] });
    expect(output).not.toHaveProperty("structuredContent.writeTargetGuidance");
    expect(output).not.toHaveProperty("structuredContent.nameMatchNote");
  });

  it("does not add write guidance to an unfiltered multi-record list", async () => {
    spies.listDeals.mockResolvedValue({
      ok: true,
      data: {
        items: [
          { id: "d1", name: "Nova Expansion" },
          { id: "d2", name: "Nova Expansion 2025" },
        ],
        pagination: { total: 2 },
      },
    });

    const output = await listDeals();
    expect(output).not.toHaveProperty("structuredContent.writeTargetGuidance");
  });

  it("does not add write guidance to a single search result", async () => {
    spies.listDeals.mockResolvedValue({
      ok: true,
      data: {
        items: [{ id: "d1", name: "Nova Expansion" }],
        pagination: { total: 1 },
      },
    });

    const output = await listDeals({ searchTerm: "Nova Expansion" });
    expect(output).not.toHaveProperty("structuredContent.writeTargetGuidance");
  });

  it("explains how to inspect matches beyond the returned page", async () => {
    spies.listDeals.mockResolvedValue({
      ok: true,
      data: {
        items: [{ id: "d1", name: "Nova Expansion" }],
        pagination: { total: 3 },
      },
    });

    const output = await listDeals({ searchTerm: "Nova Expansion", pageSize: 1 });
    expect(output).toMatchObject({
      structuredContent: {
        total: 3,
        writeTargetGuidance: {
          returnedCandidateCount: 1,
        },
      },
    });
    expect(listRecordsTool.description).toContain("review more pages first");
  });

  it("keeps duplicate-name candidates in items and explains safe disambiguation", async () => {
    spies.listDeals.mockResolvedValue({
      ok: true,
      data: {
        items: [
          { id: "d1", name: "Nova Expansion" },
          { id: "d2", name: "Nova Expansion" },
        ],
        pagination: { total: 2 },
      },
    });

    const output = await listDeals({ searchTerm: "Nova Expansion" });
    expect(output).toMatchObject({
      structuredContent: {
        writeTargetGuidance: { returnedCandidateCount: 2 },
        items: [
          { id: "d1", name: "Nova Expansion" },
          { id: "d2", name: "Nova Expansion" },
        ],
      },
    });
    expect(listRecordsTool.description).toContain("call get_records");
    expect(listRecordsTool.description).toContain("never expose raw ids");
  });
});
