import type { RecordField } from "@/features/records/record-model.schema";

import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

import { createCrmPreset, presetId } from "@/features/records/crm-preset";
import { recordMeasureIssue } from "@/features/records/record-measure-validation";
import { DisplayType } from "../widget-display.schema";
import { widgetDisplayTypeIssue } from "../widget-display-rules";
import { resolveWidgetGallery } from "../widget-gallery";

function legacyModel() {
  const companyId = randomUUID();
  const id = (key: string) => presetId(companyId, key);
  const model = createCrmPreset(companyId, "EUR");
  const status: RecordField = {
    id: randomUUID(),
    typeId: id("task"),
    label: "Status",
    valueType: "select",
    behavior: { kind: "input" },
    required: false,
    archived: false,
    publishedSummary: false,
    position: 9,
    options: ["Open", "In Progress", "Done", "Archived"].map((label) => ({
      id: randomUUID(),
      label,
      color: null,
      attributes: [],
    })),
  };
  model.fields.push(status);
  return { companyId, id, model, status };
}

describe("widget gallery resolution", () => {
  it("resolves stage semantics from probabilities and task closure from translated option labels", () => {
    const { companyId, id, model, status } = legacyModel();
    const templates = resolveWidgetGallery(companyId, model, ["Done", "Erledigt", "Archived"]);
    expect(templates.map((template) => template.key)).toEqual([
      "openPipeline",
      "dealsByStage",
      "wonValuePerMonth",
      "topOrganizationsByRevenue",
      "openTasksPerAssignee",
    ]);
    for (const template of templates) {
      expect(recordMeasureIssue(template.measure, model), template.key).toBeNull();
      expect(widgetDisplayTypeIssue(template.displayOptions.displayType, template.measure, model)).toBeNull();
    }
    const tasks = templates.find((template) => template.key === "openTasksPerAssignee");
    expect(tasks?.measure.source.filters).toEqual([
      {
        fieldId: status.id,
        operator: "notIn",
        value: null,
        values: status.options.slice(2).map((option) => ({ kind: "select", value: option.id })),
      },
    ]);
    expect(templates.find((template) => template.key === "dealsByStage")?.measure.source.filters).toEqual([
      {
        fieldId: id("deal.stage"),
        operator: "notIn",
        value: null,
        values: [{ kind: "select", value: id("deal.stage.lost") }],
      },
    ]);
    expect(templates.find((template) => template.key === "wonValuePerMonth")?.measure.groupBy).toEqual({
      path: [],
      fieldId: "system:createdAt",
      dateInterval: "month",
    });
    expect(templates.find((template) => template.key === "openPipeline")?.displayOptions.displayType).toBe(
      DisplayType.number,
    );
  });

  it("prefers a deal date field for the monthly series and hides templates whose fields are missing", () => {
    const { companyId, id, model } = legacyModel();
    const name = model.fields.find((field) => field.id === id("deal.name"));
    if (!name) throw new Error("The deal name field is missing");
    const close: RecordField = {
      ...name,
      id: randomUUID(),
      label: "Close date",
      valueType: "date",
      behavior: { kind: "input" },
      position: 20,
    };
    model.fields.push(close);
    expect(
      resolveWidgetGallery(companyId, model, []).find((template) => template.key === "wonValuePerMonth")?.measure
        .groupBy?.fieldId,
    ).toBe(close.id);
    const withoutStage = {
      ...model,
      fields: model.fields.map((field) => (field.id === id("deal.stage") ? { ...field, archived: true } : field)),
    };
    expect(resolveWidgetGallery(companyId, withoutStage, []).map((template) => template.key)).toEqual([]);
    const withoutOrganizations = {
      ...model,
      relationships: model.relationships.map((relation) =>
        relation.id === id("deal.organizations") ? { ...relation, archived: true } : relation,
      ),
    };
    expect(resolveWidgetGallery(companyId, withoutOrganizations, []).map((template) => template.key)).toEqual([
      "openPipeline",
      "dealsByStage",
      "wonValuePerMonth",
    ]);
  });
});
