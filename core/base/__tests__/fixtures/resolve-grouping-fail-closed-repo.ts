import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { Filter, FilterableField, GetQueryParams, SortDescriptor } from "../../base-get.schema";
import type { GroupCountRow } from "@/core/base/grouping/group-count";
import type { GroupableFieldSpec } from "@/core/base/grouping/groupable-field";
import { CustomColumnType, EntityType } from "@/generated/prisma";
import { BaseGetRepo } from "@/core/base/base-get.repo";
import { customSelectGroupables, relationGroupables } from "@/core/base/grouping/groupable-field";

const LIVE_COLUMN_ID = "11111111-1111-4111-8111-111111111111";

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

export class FailClosedRepo extends BaseGetRepo<Item> {
  axisCalls = 0;
  itemCalls: GetQueryParams[] = [];

  constructor(
    private readonly relations: boolean,
    private readonly declares = true,
  ) {
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
    if (!this.declares) return [];

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
