import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { Filter, FilterableField, SortDescriptor } from "../../base-get.schema";
import type { GroupableFieldSpec } from "@/core/base/grouping/groupable-field";
import { CustomColumnType, EntityType } from "@/generated/prisma";
import { BaseGetRepo } from "@/core/base/base-get.repo";
import { customSelectGroupables } from "@/core/base/grouping/groupable-field";

const COLUMN_ID = "11111111-1111-4111-8111-111111111111";

const option = (value: string, index: number) => ({
  value,
  label: value.toUpperCase(),
  color: "success" as const,
  isDefault: false,
  index,
});

const STORED = [option("won", 2), option("new", 0), option("qualified", 1)];

type Item = { id: string };

export class StubRepo extends BaseGetRepo<Item> {
  getItems(): Promise<Item[]> {
    return Promise.resolve([]);
  }

  getCount(): Promise<number> {
    return Promise.resolve(0);
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
        options: { options: STORED },
      },
    ] as unknown as CustomColumnDto[]);
  }

  async getGroupableFields(): Promise<GroupableFieldSpec[]> {
    return customSelectGroupables(EntityType.deal, await this.getCustomColumns());
  }

  countByGroup(): Promise<Array<{ key: string; count: number }>> {
    return Promise.resolve([]);
  }

  validateFilters(): Filter[] {
    return [];
  }

  validateSortDescriptor(): SortDescriptor | undefined {
    return undefined;
  }

  sumNumericFields<F extends string>(): Promise<Partial<Record<F, number | null>>> {
    return Promise.resolve({});
  }
}
