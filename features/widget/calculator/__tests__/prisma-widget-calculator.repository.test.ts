import { beforeEach, describe, expect, it, vi } from "vitest";

import { AggregationType, EntityType, WidgetGroupByType } from "@/generated/prisma";

const mocks = vi.hoisted(() => ({
  countByCustomColumn: vi.fn(),
  getDealsForEntityType: vi.fn(),
  getEntitiesForGrouping: vi.fn(),
  getEntityCount: vi.fn(),
  sumDealField: vi.fn(),
}));

vi.mock("@/core/di", () => ({
  getCustomColumnRepo: () => ({ findById: vi.fn() }),
  getWidgetDataFetcher: () => mocks,
  getWidgetGroupingService: () => ({
    buildCustomColumnPoints: vi.fn(),
    groupDealsByCustomColumn: vi.fn(),
    groupDealsByEntityType: vi.fn(),
    groupEntitiesByEntityType: vi.fn(),
  }),
}));

import { PrismaWidgetCalculatorRepo } from "../prisma-widget-calculator.repository";

function widget(entityType: EntityType, aggregationType: AggregationType) {
  return {
    aggregationType,
    dealFilters: [],
    entityFilters: [],
    entityType,
    groupByCustomColumnId: null,
    groupByType: WidgetGroupByType.none,
  };
}

describe("PrismaWidgetCalculatorRepo total labels", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns a semantic total for an ungrouped entity count", async () => {
    mocks.getEntityCount.mockResolvedValue(5);

    await expect(
      new PrismaWidgetCalculatorRepo().calculateWidgetData(widget(EntityType.contact, AggregationType.count)),
    ).resolves.toEqual([{ labelKind: "system", systemLabelKey: "total", value: 5 }]);
  });

  it("returns a semantic total for an ungrouped deal value", async () => {
    mocks.sumDealField.mockResolvedValue(1200);

    await expect(
      new PrismaWidgetCalculatorRepo().calculateWidgetData(widget(EntityType.deal, AggregationType.dealValue)),
    ).resolves.toEqual([{ labelKind: "system", systemLabelKey: "total", value: 1200 }]);
  });

  it("returns a semantic total for ungrouped service revenue", async () => {
    mocks.getDealsForEntityType.mockResolvedValue([
      {
        services: [
          { quantity: 2, service: { amount: 30 } },
          { quantity: 1, service: { amount: 15 } },
        ],
      },
    ]);

    await expect(
      new PrismaWidgetCalculatorRepo().calculateWidgetData(widget(EntityType.service, AggregationType.dealValue)),
    ).resolves.toEqual([{ labelKind: "system", systemLabelKey: "total", value: 75 }]);
  });

  it("returns a semantic total for ungrouped service quantity", async () => {
    mocks.sumDealField.mockResolvedValue(7);

    await expect(
      new PrismaWidgetCalculatorRepo().calculateWidgetData(widget(EntityType.service, AggregationType.dealQuantity)),
    ).resolves.toEqual([{ labelKind: "system", systemLabelKey: "total", value: 7 }]);
  });
});
