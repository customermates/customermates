import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { Filter, FilterableField, GetQueryParams, SortDescriptor } from "../base-get.schema";

import { describe, expect, it, vi } from "vitest";

import { EntityType } from "@/generated/prisma";

import { BaseGetInteractor, BaseGetRepo } from "../base-get.interactor";

type Item = { id: string; totalValue: number };

class StubRepo extends BaseGetRepo<Item> {
  sumCalls: GetQueryParams[] = [];

  constructor(private sums: Record<string, number>) {
    super();
  }

  getItems(): Promise<Item[]> {
    return Promise.resolve([{ id: "one", totalValue: 10 }]);
  }

  getCount(): Promise<number> {
    return Promise.resolve(1);
  }

  getSortableFields() {
    return [];
  }

  getSearchableFields() {
    return [];
  }

  getFilterableFields(): Promise<FilterableField[]> {
    return Promise.resolve([]);
  }

  getCustomColumns(): Promise<CustomColumnDto[]> {
    return Promise.resolve([]);
  }

  validateFilters(): Filter[] {
    return [];
  }

  validateSortDescriptor(): SortDescriptor | undefined {
    return undefined;
  }

  sumNumericFields<F extends string>(opts: { params: GetQueryParams }): Promise<Partial<Record<F, number | null>>> {
    this.sumCalls.push(opts.params);
    return Promise.resolve(this.sums as Partial<Record<F, number | null>>);
  }
}

class SummingInteractor extends BaseGetInteractor<Item> {
  constructor(repo: StubRepo, fields: readonly string[]) {
    super(
      repo,
      { getP13n: vi.fn(), upsertP13n: vi.fn() },
      "interactive",
      EntityType.deal,
      undefined,
      undefined,
      undefined,
      fields,
    );
  }
}

async function run(fields: readonly string[], sums: Record<string, number>, params: GetQueryParams = {}) {
  const repo = new StubRepo(sums);
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
