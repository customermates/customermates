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

  it("reports a lowered page size next to the requested one, so an adjustment never reads as a refusal", async () => {
    spies.listDeals.mockResolvedValue({ ok: true, data: { items: [], pagination: { total: 0 } } });

    const lowered = await listRecordsTool.execute(listRecordsTool.inputSchema.parse({ entity: "deal", pageSize: 50 }));
    const exact = await listRecordsTool.execute(listRecordsTool.inputSchema.parse({ entity: "deal", pageSize: 10 }));

    expect(spies.listDeals).toHaveBeenCalledWith(expect.objectContaining({ pagination: { page: 1, pageSize: 25 } }));
    expect(lowered).toMatchObject({ structuredContent: { pageSize: 25, requestedPageSize: 50 } });
    expect(exact).toMatchObject({ structuredContent: { pageSize: 10 } });
    expect(JSON.stringify(exact)).not.toContain("requestedPageSize");
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
