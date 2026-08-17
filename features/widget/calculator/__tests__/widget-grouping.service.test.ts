import { describe, expect, it } from "vitest";

import { AggregationType, EntityType, WidgetGroupByType } from "@/generated/prisma";

import { WidgetGroupingService } from "../widget-grouping.service";

const service = new WidgetGroupingService();

function widget(groupByType: WidgetGroupByType) {
  return {
    aggregationType: AggregationType.dealValue,
    dealFilters: [],
    entityFilters: [],
    entityType: EntityType.deal,
    groupByCustomColumnId: null,
    groupByType,
  };
}

describe("WidgetGroupingService semantic labels", () => {
  it.each([WidgetGroupByType.contact, WidgetGroupByType.organization])(
    "returns a system no-group point for an unassigned %s grouping",
    (groupByType) => {
      const points = service.groupDealsByEntityType(widget(groupByType), [
        { id: "deal-1", name: "Deal", totalQuantity: 1, totalValue: 42, weightedValue: null },
      ]);

      expect(points).toEqual([{ labelKind: "system", systemLabelKey: "noGroup", value: 42 }]);
    },
  );

  it("returns a system no-group point for a missing custom-column value", () => {
    const points = service.buildCustomColumnPoints([{ value: null, count: 3 }], {
      type: "singleSelect",
      options: { options: [] },
    });

    expect(points).toEqual([{ labelKind: "system", systemLabelKey: "noGroup", value: 3 }]);
  });

  it("preserves user labels that collide with former English sentinel text", () => {
    const points = service.buildCustomColumnPoints(
      [
        { value: "total", count: 2 },
        { value: "no-group", count: 1 },
      ],
      {
        type: "singleSelect",
        options: {
          options: [
            { color: "default", label: "Total", value: "total" },
            { color: "secondary", label: "no-group", value: "no-group" },
          ],
        },
      },
    );

    expect(points).toEqual([
      { labelKind: "literal", label: "Total", optionColor: "default", value: 2 },
      { labelKind: "literal", label: "no-group", optionColor: "secondary", value: 1 },
    ]);
  });
});
