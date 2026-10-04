import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { Filter, FilterableField, GetQueryParams, SortDescriptor } from "../../base-get.schema";
import type { GroupCountRow } from "@/core/base/grouping/group-count";
import type { GroupableFieldSpec } from "@/core/base/grouping/groupable-field";
import { CustomColumnType, EntityType } from "@/generated/prisma";
import { BaseGetRepo } from "@/core/base/base-get.repo";
import { NO_VALUE_GROUP_KEY } from "@/core/base/grouping/grouping.schema";
import { customSelectGroupables } from "@/core/base/grouping/groupable-field";

const COLUMN_ID = "55555555-5555-4555-8555-555555555555";

const STAGES = ["new", "qualified", "proposal", "negotiation", "won"];

type Item = { id: string };

export class SpyRepo extends BaseGetRepo<Item> {
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
