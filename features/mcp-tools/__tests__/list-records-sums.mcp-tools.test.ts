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

  it("tells an agent the totals span the filters rather than the page", () => {
    expect(listRecordsTool.description).toContain("not just the current page");
    expect(listRecordsTool.description).toContain("weightedValue");
    expect(listRecordsTool.description).toMatch(/single-select[^.]*not/i);
  });
});
