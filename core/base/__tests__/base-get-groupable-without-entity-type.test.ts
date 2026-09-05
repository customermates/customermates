import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { Filter, FilterableField, GetQueryParams, SortDescriptor } from "../base-get.schema";
import type { GroupableFieldSpec } from "@/core/base/grouping/groupable-field";
import type { GroupCountRow } from "@/core/base/grouping/group-count";

import { describe, expect, it, vi } from "vitest";

import { BaseGetInteractor, BaseGetRepo } from "../base-get.interactor";
import { enumGroupables } from "@/core/base/grouping/groupable-field";

type Item = { id: string; status: string };

const ROWS: Item[] = [
  { id: "u1", status: "active" },
  { id: "u2", status: "active" },
  { id: "u3", status: "inactive" },
];

class OperatorLikeRepo extends BaseGetRepo<Item> {
  getItems = vi.fn((params: GetQueryParams): Promise<Item[]> => {
    const key = params.groupScope?.key;
    return Promise.resolve(key ? ROWS.filter((row) => row.status === key) : ROWS);
  });

  getCount(): Promise<number> {
    return Promise.resolve(ROWS.length);
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

  getGroupableFields(): Promise<GroupableFieldSpec[]> {
    return Promise.resolve(enumGroupables("user", { status: true, plan: false, subscriptionStatus: false }));
  }

  countByGroup(): Promise<GroupCountRow[]> {
    return Promise.resolve([
      { key: "active", count: 2 },
      { key: "inactive", count: 1 },
    ]);
  }

  validateFilters(): Filter[] {
    return [];
  }

  validateSortDescriptor(): SortDescriptor | undefined {
    return undefined;
  }

  sumNumericFields = vi.fn(<F extends string>(): Promise<Partial<Record<F, number | null>>> => Promise.resolve({}));
}

class OperatorLikeInteractor extends BaseGetInteractor<Item> {
  constructor(repo: OperatorLikeRepo) {
    super(
      repo,
      { loadSurfaceState: vi.fn().mockResolvedValue({ activeViewKey: null, views: [], allState: {} }) },
      "interactive",
      undefined,
      undefined,
      undefined,
      undefined,
      ["amount"],
    );
  }
}

describe("a repository without an entity type but with groupable specs", () => {
  it("advertises its groupable fields on a flat request so the display options can offer Board", async () => {
    const result = await new OperatorLikeInteractor(new OperatorLikeRepo()).invoke({});

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.groupableFields).toEqual([
      {
        id: "status",
        grouping: { field: "status" },
        kind: "enum",
        labelKey: "Common.table.columns.status",
        supportsDragWriteBack: false,
      },
    ]);
    expect(result.data.grouping).toBeUndefined();
  });

  it("resolves a grouped request against those specs and scopes every group fetch", async () => {
    const repo = new OperatorLikeRepo();
    const result = await new OperatorLikeInteractor(repo).invoke({ grouping: { field: "status" } });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.grouping?.groups.map(({ key, count, itemIds }) => [key, count, itemIds])).toEqual([
      ["active", 2, ["u1", "u2"]],
      ["inactive", 1, ["u3"]],
      ["pendingAuthorization", 0, []],
    ]);
    expect(result.data.groupCounts).toEqual({ active: 2, inactive: 1, pendingAuthorization: 0 });
    expect(repo.getItems.mock.calls.map(([params]) => params.groupScope?.key)).toEqual([
      "active",
      "inactive",
      "pendingAuthorization",
    ]);
  });

  it("still keeps value sums behind the entity type", async () => {
    const repo = new OperatorLikeRepo();
    const result = await new OperatorLikeInteractor(repo).invoke({ grouping: { field: "status" } });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.valueSums).toBeUndefined();
    expect(result.data.groupValueSums).toBeUndefined();
    expect(repo.sumNumericFields).not.toHaveBeenCalled();
  });
});
