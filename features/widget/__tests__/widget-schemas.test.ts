import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { DiagramDataPointSchema, WidgetDtoSchema } from "../widget.schema";
const id = randomUUID();
const widget = () => ({
  id,
  companyId: "workspace",
  userId: "owner",
  kind: "chart",
  contractVersion: 2,
  version: 1,
  name: "Forecast",
  measure: {
    source: { typeId: id, filters: [], relationships: [] },
    aggregation: "sum",
    valueFieldId: randomUUID(),
    groupBy: null,
    groupLimit: 100,
  },
  displayOptions: { displayType: "verticalBarChart" },
  data: null,
  status: "unavailable",
  groupOptions: [],
  layout: null,
  viewId: null,
  isTemplate: false,
  createdAt: new Date(0),
  updatedAt: new Date(0),
});
describe("generic widget contracts", () => {
  it("round trips a validated measure and preserves an unavailable result", () => {
    const value = widget();
    expect(WidgetDtoSchema.parse(value)).toEqual(value);
  });
  it("rejects retired entity aggregation contracts", () => {
    expect(
      WidgetDtoSchema.safeParse({
        ...widget(),
        contractVersion: undefined,
        entityType: "deal",
        aggregationType: "dealValue",
      }).success,
    ).toBe(false);
  });
  it("requires stable type and field identifiers", () => {
    const value = widget();
    expect(
      WidgetDtoSchema.safeParse({ ...value, measure: { ...value.measure, source: { typeId: "Deals" } } }).success,
    ).toBe(false);
    expect(WidgetDtoSchema.safeParse({ ...value, measure: { ...value.measure, valueFieldId: "Value" } }).success).toBe(
      false,
    );
  });
  it("keeps activity queries and measures distinct", () => {
    const { measure, groupOptions, ...base } = widget();
    expect(measure).toBeDefined();
    expect(groupOptions).toEqual([]);
    const activity = {
      ...base,
      kind: "activityTimeline",
      activityQuery: { scope: { records: [], typeIds: [id] }, kinds: ["audit", "message"] },
      displayOptions: { showFilters: true },
      schemaRevision: 1,
    };
    expect(WidgetDtoSchema.safeParse(activity).success).toBe(true);
    expect(
      WidgetDtoSchema.safeParse({
        ...activity,
        activityQuery: { scope: { records: [{ typeId: id, recordId: "invalid" }] } },
      }).success,
    ).toBe(false);
  });
  it("does not accept calculation errors disguised as zero data", () => {
    expect(WidgetDtoSchema.safeParse({ ...widget(), data: [{ value: 0 }] }).success).toBe(false);
  });
  it("preserves the responsive saved layout", () => {
    const value = { ...widget(), layout: { lg: { i: id, x: 6, y: 0, w: 3, h: 2 } } };
    expect(WidgetDtoSchema.parse(value).layout).toEqual(value.layout);
  });
});
describe("chart labels", () => {
  it("keeps customer labels separate from translated system labels", () => {
    expect(DiagramDataPointSchema.parse({ labelKind: "literal", label: "Total", value: 42 })).toEqual({
      labelKind: "literal",
      label: "Total",
      value: 42,
    });
    expect(
      DiagramDataPointSchema.safeParse({ labelKind: "system", systemLabelKey: "injected", value: 42 }).success,
    ).toBe(false);
  });
});
