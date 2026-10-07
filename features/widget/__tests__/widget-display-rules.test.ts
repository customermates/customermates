import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

import type { RecordMeasure } from "@/features/records/record-measure.schema";

import { createCrmPreset, presetId } from "@/features/records/crm-preset";
import { RecordMeasureSchema } from "@/features/records/record-measure.schema";
import { DisplayType } from "../widget-display.schema";
import { widgetDisplayRequirement, widgetDisplayTypeIssue } from "../widget-display-rules";

const companyId = randomUUID();
const id = (key: string) => presetId(companyId, key);
const model = createCrmPreset(companyId);
const measure = (groupBy: RecordMeasure["groupBy"], typeId = id("deal")) =>
  RecordMeasureSchema.parse({ source: { typeId }, aggregation: "count", valueFieldId: null, groupBy });
const stage = measure({ path: [], fieldId: id("deal.stage") });
const month = measure({ path: [], fieldId: "system:createdAt", dateInterval: "month" });
const record = measure({ path: [], fieldId: null });
const ungrouped = measure(null);

describe("widget display rules", () => {
  it("names the configuration each new display type requires", () => {
    expect(widgetDisplayRequirement(DisplayType.number)).toBe("noGrouping");
    expect(widgetDisplayRequirement(DisplayType.areaChart)).toBe("timeInterval");
    expect(widgetDisplayRequirement(DisplayType.rankedTable)).toBe("grouping");
    expect(widgetDisplayRequirement(DisplayType.funnelChart)).toBe("singleChoice");
    for (const type of [
      DisplayType.verticalBarChart,
      DisplayType.horizontalBarChart,
      DisplayType.verticalBarChartWithLabels,
      DisplayType.horizontalBarChartWithLabels,
      DisplayType.doughnutChart,
      DisplayType.radarChart,
    ])
      expect(widgetDisplayRequirement(type)).toBeNull();
  });

  it.each([
    [DisplayType.number, ungrouped, null],
    [DisplayType.number, stage, "noGrouping"],
    [DisplayType.areaChart, month, null],
    [DisplayType.areaChart, stage, "timeInterval"],
    [DisplayType.areaChart, ungrouped, "timeInterval"],
    [DisplayType.rankedTable, record, null],
    [DisplayType.rankedTable, month, null],
    [DisplayType.rankedTable, ungrouped, "grouping"],
    [DisplayType.funnelChart, stage, null],
    [DisplayType.funnelChart, month, "singleChoice"],
    [DisplayType.funnelChart, record, "singleChoice"],
    [DisplayType.funnelChart, measure({ path: [], fieldId: "system:assignedTo" }), "singleChoice"],
    [DisplayType.funnelChart, measure({ path: [], fieldId: id("deal.totalValue") }), "singleChoice"],
    [DisplayType.verticalBarChart, ungrouped, null],
    [DisplayType.doughnutChart, month, null],
  ])("checks %s against the configured grouping", (type, input, expected) => {
    expect(widgetDisplayTypeIssue(type, input, model)).toBe(expected);
  });

  it("follows relationship paths to the terminal single-choice field and needs the model to confirm it", () => {
    const viaLine = measure(
      {
        path: [{ relationId: id("lineItem.deal"), direction: "outgoing" }],
        fieldId: id("deal.stage"),
      },
      id("lineItem"),
    );
    expect(widgetDisplayTypeIssue(DisplayType.funnelChart, viaLine, model)).toBeNull();
    expect(widgetDisplayTypeIssue(DisplayType.funnelChart, viaLine, null)).toBe("singleChoice");
    const archived = {
      ...model,
      fields: model.fields.map((field) => (field.id === id("deal.stage") ? { ...field, archived: true } : field)),
    };
    expect(widgetDisplayTypeIssue(DisplayType.funnelChart, stage, archived)).toBe("singleChoice");
  });
});
