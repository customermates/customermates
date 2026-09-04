import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { Filter, FilterableField, GetQueryParams, SortDescriptor } from "../base-get.schema";
import type { GroupCountRow } from "@/core/base/grouping/group-count";
import type { GroupableFieldSpec } from "@/core/base/grouping/groupable-field";

import { describe, expect, it, vi } from "vitest";

import { CustomColumnType, EntityType } from "@/generated/prisma";

import { BaseGetInteractor, BaseGetRepo } from "../base-get.interactor";
import { MAX_MATERIALISED_GROUPS, NO_VALUE_GROUP_KEY } from "@/core/base/grouping/grouping.schema";
import { ViewMode } from "../base-query-builder";
import { customSelectGroupables } from "@/core/base/grouping/groupable-field";

const COLUMN_ID = "55555555-5555-4555-8555-555555555555";
const STAGES = ["new", "qualified", "proposal", "negotiation", "won"];

type Item = { id: string };

class SpyRepo extends BaseGetRepo<Item> {
  itemCalls: GetQueryParams[] = [];
  countCalls: GetQueryParams[] = [];
  axisCalls: unknown[] = [];
  sumCalls: GetQueryParams[] = [];

  constructor(
    private perGroupRows = 3,
    private stages: readonly string[] = STAGES,
  ) {
    super();
  }

  getItems(params: GetQueryParams): Promise<Item[]> {
    this.itemCalls.push(params);
    const key = params.groupScope?.key ?? "flat";

    return Promise.resolve(Array.from({ length: this.perGroupRows }, (_unused, index) => ({ id: `${key}-${index}` })));
  }

  getCount(params: GetQueryParams): Promise<number> {
    this.countCalls.push(params);
    return Promise.resolve(42);
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
    return Promise.resolve([
      {
        id: COLUMN_ID,
        label: "Stage",
        entityType: EntityType.deal,
        type: CustomColumnType.singleSelect,
        options: {
          options: this.stages.map((value, index) => ({
            value,
            label: value,
            color: "success",
            isDefault: false,
            index,
          })),
        },
      },
    ] as unknown as CustomColumnDto[]);
  }

  async getGroupableFields(): Promise<GroupableFieldSpec[]> {
    return customSelectGroupables(EntityType.deal, await this.getCustomColumns());
  }

  countByGroup(args: unknown): Promise<GroupCountRow[]> {
    this.axisCalls.push(args);

    return Promise.resolve([
      ...this.stages.map((value, index) => ({ key: value, count: index + 1 })),
      { key: NO_VALUE_GROUP_KEY, count: 7 },
    ]);
  }

  validateFilters(): Filter[] {
    return [];
  }

  validateSortDescriptor(): SortDescriptor | undefined {
    return undefined;
  }

  sumNumericFields<F extends string>(opts: { params: GetQueryParams }): Promise<Partial<Record<F, number | null>>> {
    this.sumCalls.push(opts.params);
    return Promise.resolve({ totalValue: 5 } as Partial<Record<F, number | null>>);
  }
}

class BudgetInteractor extends BaseGetInteractor<Item> {
  constructor(repo: SpyRepo, sumFields: readonly string[] = ["totalValue"]) {
    super(
      repo,
      { loadSurfaceState: vi.fn().mockResolvedValue({ activeViewKey: null, views: [], overrides: new Map() }) },
      "interactive",
      EntityType.deal,
      undefined,
      undefined,
      undefined,
      sumFields,
    );
  }
}

async function run(params: GetQueryParams, perGroupRows = 3, sumFields: readonly string[] = ["totalValue"]) {
  const repo = new SpyRepo(perGroupRows);
  const result = await new BudgetInteractor(repo, sumFields).invoke({
    viewMode: ViewMode.card,
    grouping: { field: COLUMN_ID },
    ...params,
  });

  if (!result.ok) throw new Error("the budget interactor was expected to succeed");

  return { repo, data: result.data };
}

describe("a grouped read costs one axis, one total and one page per materialised group", () => {
  it("issues exactly one countByGroup, one getCount and one getItems per group", async () => {
    const { repo } = await run({ groupPage: { perGroup: 10 } });

    expect(repo.axisCalls).toHaveLength(1);
    expect(repo.countCalls).toHaveLength(1);
    expect(repo.itemCalls).toHaveLength(6);
    expect(repo.itemCalls.map((call) => call.groupScope?.key)).toEqual([...STAGES, NO_VALUE_GROUP_KEY]);
  });

  it("takes the total from the flat count rather than from the sum of group counts", async () => {
    const { data } = await run({ groupPage: { perGroup: 10 } });

    expect(data.pagination?.total).toBe(42);
    expect(data.grouping?.total).toBe(42);
    expect(Object.values(data.groupCounts ?? {}).reduce((sum, value) => sum + value, 0)).toBe(22);
  });

  it("drops a collapsed group's item page and its sum entirely", async () => {
    const { repo } = await run({ groupPage: { perGroup: 10, collapsed: ["won", NO_VALUE_GROUP_KEY] } });

    expect(repo.itemCalls.map((call) => call.groupScope?.key)).toEqual(["new", "qualified", "proposal", "negotiation"]);
    expect(repo.sumCalls.filter((call) => call.groupScope !== undefined)).toHaveLength(4);
    expect(repo.axisCalls).toHaveLength(1);
  });

  it("keeps a collapsed group on the axis with its count and no items", async () => {
    const { data } = await run({ groupPage: { perGroup: 10, collapsed: ["won"] } });
    const won = data.grouping?.groups.find((group) => group.key === "won");

    expect(won).toMatchObject({ count: 5, materialised: false, itemIds: [], hasMore: true });
    expect(data.groupCounts?.won).toBe(5);
  });

  it("leaves every group past the materialisation cap loadable instead of silently empty", async () => {
    const stages = Array.from({ length: MAX_MATERIALISED_GROUPS + 5 }, (_unused, index) => `stage-${index}`);
    const repo = new SpyRepo(3, stages);
    const result = await new BudgetInteractor(repo).invoke({
      viewMode: ViewMode.card,
      grouping: { field: COLUMN_ID },
      groupPage: { perGroup: 10 },
    });

    if (!result.ok) throw new Error("the budget interactor was expected to succeed");

    const beyondCap = result.data.grouping?.groups.slice(MAX_MATERIALISED_GROUPS) ?? [];

    expect(repo.itemCalls).toHaveLength(MAX_MATERIALISED_GROUPS);
    expect(beyondCap).toHaveLength(6);
    expect(beyondCap.every((group) => group.count > 0 && !group.materialised && group.itemIds.length === 0)).toBe(true);
    expect(beyondCap.every((group) => group.hasMore)).toBe(true);
  });

  it("fetches only the named group on a load more and returns a partial result", async () => {
    const { repo, data } = await run({ groupPage: { perGroup: 10, only: "won", overrides: { won: 20 } } });

    expect(repo.axisCalls).toHaveLength(0);
    expect(repo.countCalls).toHaveLength(0);
    expect(repo.itemCalls).toHaveLength(1);
    expect(repo.itemCalls[0]).toMatchObject({ take: 21, skip: 0 });
    expect(repo.itemCalls[0].groupScope?.key).toBe("won");
    expect(data.grouping?.partial).toBe(true);
    expect(data.grouping?.groups.map((group) => group.key)).toEqual(["won"]);
  });

  it("asks for one row beyond the page and reports hasMore only when it came back", async () => {
    const short = await run({ groupPage: { perGroup: 3 } }, 3);
    const long = await run({ groupPage: { perGroup: 3 } }, 4);

    expect(short.repo.itemCalls[0].take).toBe(4);
    expect(short.data.grouping?.groups[0]).toMatchObject({ hasMore: false, itemIds: ["new-0", "new-1", "new-2"] });
    expect(long.data.grouping?.groups[0]).toMatchObject({ hasMore: true, itemIds: ["new-0", "new-1", "new-2"] });
  });

  it("never asks for a group sum when the surface declares none", async () => {
    const { repo, data } = await run({ groupPage: { perGroup: 10 } }, 3, []);

    expect(repo.sumCalls).toHaveLength(0);
    expect(data.groupValueSums).toBeUndefined();
  });

  it("never asks for a group sum when the caller opted out", async () => {
    const { repo } = await run({ groupPage: { perGroup: 10, includeValueSums: false } });

    expect(repo.sumCalls.filter((call) => call.groupScope !== undefined)).toHaveLength(0);
    expect(repo.sumCalls).toHaveLength(1);
  });

  it("keeps the legacy grouped pagination request working at the same budget", async () => {
    const repo = new SpyRepo(3);
    const result = await new BudgetInteractor(repo).invoke({
      groupedPagination: { groupingColumnId: COLUMN_ID, perGroup: 10, overrides: { won: 20 } },
    });

    expect(result.ok).toBe(true);
    expect(repo.axisCalls).toHaveLength(1);
    expect(repo.countCalls).toHaveLength(1);
    expect(repo.itemCalls).toHaveLength(6);
    expect(repo.itemCalls.find((call) => call.groupScope?.key === "won")?.take).toBe(21);
  });

  it("de duplicates the flat item array while each group keeps its own membership", async () => {
    const repo = new SpyRepo(1);
    repo.getItems = (params: GetQueryParams) => {
      repo.itemCalls.push(params);
      return Promise.resolve([{ id: "shared" }]);
    };

    const result = await new BudgetInteractor(repo).invoke({
      viewMode: ViewMode.card,
      grouping: { field: COLUMN_ID },
      groupPage: { perGroup: 10 },
    });

    if (!result.ok) throw new Error("expected success");

    expect(result.data.items).toEqual([{ id: "shared" }]);
    expect(result.data.grouping?.groups.map((group) => group.itemIds)).toEqual([
      ["shared"],
      ["shared"],
      ["shared"],
      ["shared"],
      ["shared"],
      ["shared"],
    ]);
  });
});
