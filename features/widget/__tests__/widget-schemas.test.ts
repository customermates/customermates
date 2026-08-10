import { describe, it, expect } from "vitest";

import { AggregationType, EntityType, WidgetGroupByType } from "@/generated/prisma";

import { ChartColor, DiagramDataPointSchema, DisplayType, WidgetDtoSchema } from "../widget.schema";
import { FilterOperatorKey } from "@/core/base/base-query-builder";

const VALID_UUID = "00000000-0000-4000-8000-000000000001";

function widgetRow(overrides: Record<string, unknown> = {}) {
  return {
    id: VALID_UUID,
    userId: "user-1",
    companyId: "company-1",
    name: "Total Deal Value",
    entityType: EntityType.deal,
    entityFilters: [],
    dealFilters: [],
    displayOptions: null,
    groupByType: WidgetGroupByType.none,
    groupByCustomColumnId: null,
    aggregationType: AggregationType.dealValue,
    layout: null,
    data: [],
    isTemplate: false,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}

describe("WidgetDtoSchema", () => {
  it("accepts the shape the repository mapper produces for an unconfigured widget", () => {
    const result = WidgetDtoSchema.safeParse(widgetRow());

    expect(result.success).toBe(true);
  });

  it("round-trips a fully populated widget without dropping anything", () => {
    const row = widgetRow({
      entityFilters: [{ field: "dealStatus", operator: FilterOperatorKey.notIn, value: ["abandoned"] }],
      dealFilters: [{ field: "name", operator: FilterOperatorKey.contains, value: "acme" }],
      displayOptions: {
        barColors: [ChartColor.success1, ChartColor.warning1],
        displayType: DisplayType.doughnutChart,
        reverseXAxis: true,
        reverseYAxis: false,
        useGroupColors: true,
        showLegend: true,
        showFilters: true,
      },
      layout: {
        xs: { i: VALID_UUID, x: 0, y: 0, w: 4, h: 2 },
        sm: { i: VALID_UUID, x: 0, y: 0, w: 4, h: 2 },
        md: { i: VALID_UUID, x: 3, y: 0, w: 3, h: 2 },
        lg: { i: VALID_UUID, x: 6, y: 0, w: 3, h: 2 },
      },
      data: [{ labelKind: "literal", label: "Customer-provided Total", value: 42, optionColor: "success" }],
      groupByType: WidgetGroupByType.customColumn,
      groupByCustomColumnId: VALID_UUID,
    });

    const result = WidgetDtoSchema.safeParse(row);

    expect(result.success).toBe(true);
    expect(result.data).toEqual(row);
  });

  it("keeps a layout that only carries one breakpoint", () => {
    const row = widgetRow({ layout: { lg: { i: VALID_UUID, x: 6, y: 0, w: 3, h: 2 } } });

    const result = WidgetDtoSchema.safeParse(row);

    expect(result.success).toBe(true);
    expect(result.data?.layout).toEqual({ lg: { i: VALID_UUID, x: 6, y: 0, w: 3, h: 2 } });
  });

  it("rejects null filter columns, which is why the mapper normalizes them to empty", () => {
    expect(WidgetDtoSchema.safeParse(widgetRow({ entityFilters: null })).success).toBe(false);
    expect(WidgetDtoSchema.safeParse(widgetRow({ dealFilters: null })).success).toBe(false);
  });

  it("requires dealFilters rather than treating an absent column as optional", () => {
    const row = widgetRow();
    delete (row as Record<string, unknown>).dealFilters;

    expect(WidgetDtoSchema.safeParse(row).success).toBe(false);
  });

  it("requires data, so a widget that skipped calculation does not parse", () => {
    const row = widgetRow();
    delete (row as Record<string, unknown>).data;

    const result = WidgetDtoSchema.safeParse(row);

    expect(result.success).toBe(false);
    expect(result.error?.issues.some((issue) => issue.path[0] === "data")).toBe(true);
  });

  it("strips unknown keys, the way ValidateOutput reassigns the payload", () => {
    const result = WidgetDtoSchema.safeParse({ ...widgetRow(), rogue: "value" });

    expect(result.success).toBe(true);
    expect(result.data).not.toHaveProperty("rogue");
    expect(Object.keys(result.data ?? {}).sort()).toEqual(Object.keys(WidgetDtoSchema.shape).sort());
  });

  it("rejects a filter operator outside the union", () => {
    const row = widgetRow({ entityFilters: [{ field: "dealStatus", operator: "betwixt", value: "x" }] });

    expect(WidgetDtoSchema.safeParse(row).success).toBe(false);
  });

  it("rejects a display type outside the enum", () => {
    const row = widgetRow({ displayOptions: { displayType: "pieChart" } });

    expect(WidgetDtoSchema.safeParse(row).success).toBe(false);
  });

  it("rejects a data point colour outside the chip palette", () => {
    const row = widgetRow({
      data: [{ labelKind: "literal", label: "Customer-provided Total", value: 1, optionColor: "neon" }],
    });

    expect(WidgetDtoSchema.safeParse(row).success).toBe(false);
  });

  it("enforces the literal and system label variants at runtime", () => {
    expect(DiagramDataPointSchema.safeParse({ labelKind: "literal", label: "Total", value: 1 }).success).toBe(true);
    expect(DiagramDataPointSchema.safeParse({ labelKind: "system", systemLabelKey: "total", value: 1 }).success).toBe(
      true,
    );
    expect(DiagramDataPointSchema.safeParse({ labelKind: "literal", label: "", value: 1 }).success).toBe(false);
    expect(DiagramDataPointSchema.safeParse({ labelKind: "system", value: 1 }).success).toBe(false);
    expect(
      DiagramDataPointSchema.safeParse({
        labelKind: "literal",
        label: "Total",
        systemLabelKey: "total",
        value: 1,
      }).success,
    ).toBe(false);
    expect(
      DiagramDataPointSchema.safeParse({
        labelKind: "system",
        label: "Total",
        systemLabelKey: "total",
        value: 1,
      }).success,
    ).toBe(false);
  });
});
