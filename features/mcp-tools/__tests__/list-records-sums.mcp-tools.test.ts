import { describe, it, expect, vi } from "vitest";

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
          candidates: ["Nova Expansion", "Nova Expansion 2025"],
        },
      },
    });
    expect(typeof output === "string" ? output : output.text).toContain(
      "An exact-name result does not resolve the other matches",
    );
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
    expect(typeof output === "string" ? output : output.text).toContain("review more pages before acting");
  });
});
