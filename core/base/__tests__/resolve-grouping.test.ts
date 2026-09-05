import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { Filter, FilterableField, GetQueryParams, SortDescriptor } from "../base-get.schema";
import type { GroupCountRow } from "@/core/base/grouping/group-count";
import type { GroupableFieldSpec } from "@/core/base/grouping/groupable-field";

import { describe, expect, it, vi } from "vitest";

import { CustomColumnType, EntityType } from "@/generated/prisma";

import { BaseGetInteractor, BaseGetRepo } from "../base-get.interactor";
import { ViewMode } from "../base-query-builder";
import { customSelectGroupables, relationGroupables } from "@/core/base/grouping/groupable-field";

const LIVE_COLUMN_ID = "11111111-1111-4111-8111-111111111111";
const DELETED_COLUMN_ID = "22222222-2222-4222-8222-222222222222";

type Item = { id: string };

function singleSelect(id: string): CustomColumnDto {
  return {
    id,
    label: "Stage",
    entityType: EntityType.deal,
    type: CustomColumnType.singleSelect,
    options: { options: [{ value: "new", label: "New", color: "info", isDefault: false, index: 0 }] },
  } as unknown as CustomColumnDto;
}

class FailClosedRepo extends BaseGetRepo<Item> {
  axisCalls = 0;
  itemCalls: GetQueryParams[] = [];

  constructor(private readonly relations: boolean) {
    super();
  }

  getItems(params: GetQueryParams): Promise<Item[]> {
    this.itemCalls.push(params);
    return Promise.resolve([{ id: "deal-1" }]);
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
    return Promise.resolve([singleSelect(LIVE_COLUMN_ID)]);
  }

  async getGroupableFields(): Promise<GroupableFieldSpec[]> {
    return [
      ...customSelectGroupables(EntityType.deal, await this.getCustomColumns()),
      ...(this.relations
        ? relationGroupables("deal", {
            contactIds: true,
            organizationIds: false,
            serviceIds: false,
            taskIds: false,
            userIds: false,
          })
        : []),
    ];
  }

  countByGroup(): Promise<GroupCountRow[]> {
    this.axisCalls += 1;
    return Promise.resolve([]);
  }

  validateFilters(): Filter[] {
    return [];
  }

  validateSortDescriptor(): SortDescriptor | undefined {
    return undefined;
  }

  sumNumericFields<F extends string>(): Promise<Partial<Record<F, number | null>>> {
    return Promise.resolve({} as Partial<Record<F, number | null>>);
  }
}

class GroupedSurface extends BaseGetInteractor<Item> {
  constructor(repo: FailClosedRepo) {
    super(
      repo,
      { loadSurfaceState: vi.fn().mockResolvedValue({ activeViewKey: null, views: [], allState: {} }) },
      "interactive",
      EntityType.deal,
    );
  }
}

class UngroupableSurface extends BaseGetInteractor<Item> {
  constructor(repo: FailClosedRepo) {
    super(
      repo,
      { loadSurfaceState: vi.fn().mockResolvedValue({ activeViewKey: null, views: [], allState: {} }) },
      "interactive",
      undefined,
    );
  }
}

async function run(
  params: GetQueryParams,
  options: { relations?: boolean; ungroupable?: boolean } = {},
): Promise<{ repo: FailClosedRepo; data: Awaited<ReturnType<GroupedSurface["invoke"]>> }> {
  const repo = new FailClosedRepo(options.relations ?? false);
  const interactor = options.ungroupable ? new UngroupableSurface(repo) : new GroupedSurface(repo);
  const data = await interactor.invoke({ viewMode: ViewMode.card, ...params });

  return { repo, data };
}

function grouped(data: Awaited<ReturnType<GroupedSurface["invoke"]>>) {
  if (!data.ok) throw new Error("the fail closed surface was expected to answer");

  return data.data;
}

describe("an unresolvable grouping descriptor degrades to a flat read", () => {
  it("groups when the descriptor names a column the surface still has", async () => {
    const { repo, data } = await run({ grouping: { field: LIVE_COLUMN_ID } });

    expect(grouped(data).grouping?.grouping).toEqual({ field: LIVE_COLUMN_ID });
    expect(repo.axisCalls).toBe(1);
  });

  it("returns no grouping and never touches the axis for a deleted custom column", async () => {
    const { repo, data } = await run({ grouping: { field: DELETED_COLUMN_ID } });

    expect(grouped(data).grouping).toBeUndefined();
    expect(repo.axisCalls).toBe(0);
    expect(repo.itemCalls[0]?.groupScope).toBeUndefined();
  });

  it("returns no grouping for a relation the surface does not offer this viewer", async () => {
    const withRelation = await run({ grouping: { field: "contactIds" } }, { relations: true });

    expect(grouped(withRelation.data).grouping?.kind).toBe("relation");

    const withoutRelation = await run({ grouping: { field: "contactIds" } }, { relations: false });

    expect(grouped(withoutRelation.data).grouping).toBeUndefined();
    expect(withoutRelation.repo.axisCalls).toBe(0);
  });

  it("returns no grouping for a field the surface never declared", async () => {
    const { repo, data } = await run({ grouping: { field: "type" } });

    expect(grouped(data).grouping).toBeUndefined();
    expect(grouped(data).groupableFields?.some((field) => field.id === "type")).not.toBe(true);
    expect(repo.axisCalls).toBe(0);
  });

  it("offers and resolves nothing at all on a surface that declares no entity type", async () => {
    const { repo, data } = await run({ grouping: { field: LIVE_COLUMN_ID } }, { ungroupable: true });

    expect(grouped(data).grouping).toBeUndefined();
    expect(grouped(data).groupableFields).toBeUndefined();
    expect(repo.axisCalls).toBe(0);
  });

  it("lifts a legacy grouped pagination request that carries no descriptor", async () => {
    const { repo, data } = await run({
      groupedPagination: { groupingColumnId: LIVE_COLUMN_ID, perGroup: 5 },
    } as unknown as GetQueryParams);

    expect(grouped(data).grouping?.grouping).toEqual({ field: LIVE_COLUMN_ID });
    expect(repo.axisCalls).toBe(1);
  });

  it("degrades a legacy request naming a deleted column instead of failing the read", async () => {
    const { repo, data } = await run({
      groupedPagination: { groupingColumnId: DELETED_COLUMN_ID, perGroup: 5 },
    } as unknown as GetQueryParams);

    expect(data.ok).toBe(true);
    expect(grouped(data).grouping).toBeUndefined();
    expect(repo.axisCalls).toBe(0);
  });
});
