import type { CustomColumnDto } from "@/core/data-view/column-presentation.schema";
import type { Filter, FilterableField, GetQueryParams, SortDescriptor } from "../../base-get.schema";
import type { GroupableFieldSpec } from "@/core/base/grouping/groupable-field";
import type { GroupCountRow } from "@/core/base/grouping/group-axis";
import { vi } from "vitest";
import { BaseGetRepo } from "@/core/base/base-get.repo";
import { enumGroupables } from "@/core/base/grouping/groupable-field";

type Item = { id: string; status: string };

const ROWS: Item[] = [
  { id: "u1", status: "active" },
  { id: "u2", status: "active" },
  { id: "u3", status: "inactive" },
];

export class OperatorLikeRepo extends BaseGetRepo<Item> {
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
}
