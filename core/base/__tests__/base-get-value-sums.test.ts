import { StubRepo } from "./fixtures/base-get-value-sums-stub-repo";
import { SummingInteractor } from "./fixtures/base-get-value-sums-summing-interactor";

import type { CustomColumnDto } from "@/core/data-view/column-presentation.schema";
import type { GetQueryParams } from "../base-get.schema";

import { describe, expect, it } from "vitest";

async function run(
  fields: readonly string[],
  sums: Record<string, number>,
  params: GetQueryParams = {},
  customColumns: CustomColumnDto[] = [],
) {
  const repo = new StubRepo(sums, customColumns);
  const result = await new SummingInteractor(repo, fields).invoke(params);
  return { repo, result };
}

describe("BaseGetInteractor declared value sums", () => {
  it("returns totals for the whole filtered query, not the page", async () => {
    const { result } = await run(["totalValue", "weightedValue"], { totalValue: 1965900, weightedValue: 763150 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.items).toHaveLength(1);
    expect(result.data.valueSums).toEqual({ totalValue: 1965900, weightedValue: 763150 });
  });

  it("sums under the same search and filters the list ran with", async () => {
    const { repo } = await run(["totalValue"], { totalValue: 42 }, { searchTerm: "acme" });

    expect(repo.sumCalls).toHaveLength(1);
    expect(repo.sumCalls[0].searchTerm).toBe("acme");
  });

  it("omits a field the aggregate could not measure", async () => {
    const { result } = await run(["totalValue", "weightedValue"], { totalValue: 10 });

    if (!result.ok) return;
    expect(result.data.valueSums).toEqual({ totalValue: 10 });
  });

  it("stays silent and does not query when an entity declares no summable fields", async () => {
    const { repo, result } = await run([], { totalValue: 10 });

    if (!result.ok) return;
    expect(result.data.valueSums).toBeUndefined();
    expect(repo.sumCalls).toHaveLength(0);
  });
});
