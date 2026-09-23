import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { Filter, FilterableField, GetQueryParams, SortDescriptor } from "../base-get.schema";

import { describe, expect, it, vi } from "vitest";

import { Currency, CustomColumnType, EntityType } from "@/generated/prisma";

import { BaseGetInteractor, BaseGetRepo } from "../base-get.interactor";

type Item = { id: string; totalValue: number };

class StubRepo extends BaseGetRepo<Item> {
  sumCalls: GetQueryParams[] = [];
  customSumCalls: (readonly string[])[] = [];

  constructor(
    private sums: Record<string, number>,
    private customColumns: CustomColumnDto[] = [],
  ) {
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
    return Promise.resolve(this.customColumns);
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

  sumCustomColumnValues(opts: { columnIds: readonly string[] }): Promise<Record<string, number>> {
    this.customSumCalls.push(opts.columnIds);
    return Promise.resolve(Object.fromEntries(opts.columnIds.map((columnId, index) => [columnId, 1000 * (index + 1)])));
  }
}

class SummingInteractor extends BaseGetInteractor<Item> {
  constructor(repo: StubRepo, fields: readonly string[]) {
    super(
      repo,
      { loadSurfaceState: vi.fn().mockResolvedValue({ activeViewKey: null, views: [], allState: {} }) },
      "interactive",
      EntityType.deal,
      undefined,
      undefined,
      undefined,
      fields,
    );
  }
}

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

const COMMITTED_ID = "3f2c1a8e-0b7d-4c55-9a61-2d4e8f0a9b11";
const RETAINER_ID = "5a9d7c3b-6e21-4f08-8b4a-7c1e2d3f4a52";
const NOTE_ID = "8c4e2f1a-9d36-4b7e-a0c5-1f2e3d4c5b63";
const DUE_ID = "b1d3e5f7-2a4c-4e68-9b0d-3c5e7f9a1b74";

const CUSTOM_COLUMNS: CustomColumnDto[] = [
  { id: NOTE_ID, label: "Account note", entityType: EntityType.deal, type: CustomColumnType.plain },
  {
    id: COMMITTED_ID,
    label: "Committed amount",
    entityType: EntityType.deal,
    type: CustomColumnType.currency,
    options: { currency: Currency.eur },
  },
  { id: DUE_ID, label: "Due date", entityType: EntityType.deal, type: CustomColumnType.dateTime },
  {
    id: RETAINER_ID,
    label: "Retainer",
    entityType: EntityType.deal,
    type: CustomColumnType.currency,
    options: { currency: Currency.eur },
  },
];

describe("BaseGetInteractor custom currency sums", () => {
  it("sums only the currency columns and adds them next to the declared sums", async () => {
    const { repo, result } = await run(["totalValue"], { totalValue: 500 }, {}, CUSTOM_COLUMNS);

    expect(repo.customSumCalls).toEqual([[COMMITTED_ID, RETAINER_ID]]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.valueSums).toEqual({ totalValue: 500, [COMMITTED_ID]: 1000, [RETAINER_ID]: 2000 });
  });

  it("reports the currency sums when the entity declares no summable fields", async () => {
    const { repo, result } = await run([], {}, {}, CUSTOM_COLUMNS);

    expect(repo.sumCalls).toHaveLength(0);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.valueSums).toEqual({ [COMMITTED_ID]: 1000, [RETAINER_ID]: 2000 });
  });

  it("does not ask for custom sums when no column is a currency", async () => {
    const { repo, result } = await run(["totalValue"], { totalValue: 500 }, {}, [CUSTOM_COLUMNS[0], CUSTOM_COLUMNS[2]]);

    expect(repo.customSumCalls).toEqual([]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.valueSums).toEqual({ totalValue: 500 });
  });
});
