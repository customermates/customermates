import type { GroupCountRow } from "@/core/base/grouping/group-count";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { CustomColumnType, EntityType } from "@/generated/prisma";

import { createMockUser } from "@/tests/helpers/mock-user";
import { createMockDiModule, MOCK_ENV_MODULE, MOCK_PRISMA_DB_MODULE } from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();
const { dealBuildQueryArgs } = vi.hoisted(() => ({
  dealBuildQueryArgs: vi.fn(),
}));

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);
vi.mock("@/core/di", () => ({
  ...createMockDiModule(() => mockUser),
  getDealRepo: () => ({ buildQueryArgs: dealBuildQueryArgs }),
}));

import { WidgetDataFetcher } from "../widget-data-fetcher.service";
import { NO_VALUE_GROUP_KEY } from "@/core/base/grouping/grouping.schema";
import { runWithTenant } from "@/core/decorators/tenant-context";

const COLUMN_ID = "77777777-7777-4777-8777-777777777777";

const STAGE_COLUMN = {
  id: COLUMN_ID,
  label: "Stage",
  entityType: EntityType.deal,
  type: CustomColumnType.singleSelect,
  options: {
    options: [
      { value: "won", label: "Won", color: "success", isDefault: false, index: 1 },
      { value: "new", label: "New", color: "info", isDefault: false, index: 0 },
    ],
  },
} as unknown as CustomColumnDto;

const PLAIN_TEXT_COLUMN = { ...STAGE_COLUMN, type: CustomColumnType.plain } as unknown as CustomColumnDto;

function count(rows: GroupCountRow[], column: CustomColumnDto = STAGE_COLUMN) {
  const axis = vi
    .spyOn(WidgetDataFetcher.prototype, "countByGroupInScope")
    .mockResolvedValue(rows as unknown as GroupCountRow[]);

  return runWithTenant(mockUser, async () => ({
    axis,
    result: await new WidgetDataFetcher().countByCustomColumn(EntityType.deal, undefined, column),
  }));
}

describe("the widget count axis is the shared group count", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    dealBuildQueryArgs.mockReset();
    dealBuildQueryArgs.mockResolvedValue({ where: { companyId: mockUser.companyId, deletedAt: null } });
  });

  it("counts through the one shared axis, on the filtered entity scope", async () => {
    const { axis } = await count([{ key: "won", count: 3 }]);

    expect(axis).toHaveBeenCalledOnce();
    expect(axis.mock.lastCall?.[0].where).toEqual({ companyId: mockUser.companyId, deletedAt: null });
    expect(axis.mock.lastCall?.[0].spec).toMatchObject({
      kind: "customSingleSelect",
      field: COLUMN_ID,
      model: "deal",
      entityType: EntityType.deal,
    });
  });

  it("reports the no value bucket as a null value, which is the shape the calculator reads", async () => {
    const { result } = await count([
      { key: "won", count: 3 },
      { key: NO_VALUE_GROUP_KEY, count: 2 },
    ]);

    expect(result).toEqual([
      { value: "won", count: 3 },
      { value: null, count: 2 },
    ]);
  });

  it("drops an empty no value bucket rather than charting a zero slice", async () => {
    const { result } = await count([
      { key: "won", count: 3 },
      { key: NO_VALUE_GROUP_KEY, count: 0 },
    ]);

    expect(result).toEqual([{ value: "won", count: 3 }]);
  });

  it("answers nothing and never queries for a column that is not a single select", async () => {
    const { axis, result } = await count([{ key: "won", count: 3 }], PLAIN_TEXT_COLUMN);

    expect(result).toEqual([]);
    expect(axis).not.toHaveBeenCalled();
    expect(dealBuildQueryArgs).not.toHaveBeenCalled();
  });
});
