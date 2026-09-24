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

function listDeals() {
  return listRecordsTool.execute(listRecordsTool.inputSchema.parse({ entity: "deal" }));
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

  it("tells an agent the totals span the filters rather than the page", () => {
    expect(listRecordsTool.description).toContain("not just the current page");
    expect(listRecordsTool.description).toContain("weightedValue");
    expect(listRecordsTool.description).toMatch(/single-select[^.]*not/i);
  });
});
