import type { RecordField, RecordModel, RecordRelationship, RecordType } from "@/features/records/record-model.schema";

import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

import { createCrmPreset, presetId } from "@/features/records/crm-preset";
import { recordMeasureIssue } from "@/features/records/record-measure-validation";
import { DisplayType } from "../widget-display.schema";
import { widgetDisplayTypeIssue } from "../widget-display-rules";
import { WIDGET_GALLERY_CREATED_AT_LABEL, WIDGET_GALLERY_LIMIT, resolveWidgetGallery } from "../widget-gallery";

function crmModel() {
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
  return { id, model, status };
}

function type(label: string, pluralLabel: string, position: number): RecordType {
  return {
    id: randomUUID(),
    label,
    pluralLabel,
    description: "",
    icon: "box",
    primaryFieldId: randomUUID(),
    parentRelationshipId: null,
    embedded: false,
    navigationVisible: true,
    archived: false,
    position,
    defaults: {
      columns: [],
      hiddenColumns: [],
      layout: "table",
      groupBy: null,
      sortField: null,
      sortDirection: "asc",
      pinnedFields: [],
    },
  };
}

function field(
  typeId: string,
  label: string,
  valueType: RecordField["valueType"],
  options: string[] = [],
): RecordField {
  return {
    id: randomUUID(),
    typeId,
    label,
    valueType,
    behavior: { kind: "input" },
    required: false,
    archived: false,
    publishedSummary: false,
    position: 0,
    options: options.map((option) => ({ id: randomUUID(), label: option, color: null, attributes: [] })),
  };
}

function relation(sourceTypeId: string, targetTypeId: string): RecordRelationship {
  return {
    id: randomUUID(),
    sourceTypeId,
    targetTypeId,
    sourceLabel: "Source",
    targetLabel: "Target",
    sourceCardinality: "many",
    targetCardinality: "many",
    onSourceDelete: "unlink",
    onTargetDelete: "unlink",
    archived: false,
  };
}

/** A recruiting model with no CRM vocabulary at all. */
function recruitingModel() {
  const candidates = type("Candidate", "Candidates", 0);
  const roles = type("Role", "Roles", 1);
  const salary = field(candidates.id, "Expected salary", "currency");
  const stage = field(candidates.id, "Pipeline step", "select", ["Applied", "Screen", "Interview", "Offer"]);
  const applied = field(candidates.id, "Applied on", "date");
  const recruiter = field(candidates.id, "Recruiter", "member");
  const appliedFor = relation(candidates.id, roles.id);
  const title = field(roles.id, "Title", "text");
  candidates.defaults.groupBy = stage.id;
  roles.primaryFieldId = title.id;
  const model: RecordModel = {
    revision: 3,
    types: [candidates, roles],
    fields: [salary, stage, applied, recruiter, title],
    relationships: [appliedFor],
    accessPresets: [],
    capabilities: [],
  } as unknown as RecordModel;
  return { model, candidates, roles, salary, stage, applied, recruiter, appliedFor };
}

function expectValid(model: RecordModel, templates: ReturnType<typeof resolveWidgetGallery>) {
  for (const template of templates) {
    expect(recordMeasureIssue(template.measure, model), template.key).toBeNull();
    expect(
      widgetDisplayTypeIssue(template.displayOptions.displayType, template.measure, model),
      template.key,
    ).toBeNull();
  }
}

describe("starter widgets derived from the data model", () => {
  it("derives pipeline starters from stage probabilities and closure from option labels", () => {
    const { id, model, status } = crmModel();
    const templates = resolveWidgetGallery(model, ["Done", "Erledigt", "Archived"]);
    expectValid(model, templates);
    expect(templates.length).toBeLessThanOrEqual(WIDGET_GALLERY_LIMIT);
    const deals = templates.filter((template) => template.measure.source.typeId === id("deal"));
    expect(deals.map((template) => template.recipe)).toEqual([
      "openValueTotal",
      "stageFunnel",
      "wonValueOverTime",
      "topRelatedByWonValue",
    ]);
    const open = deals[0];
    expect(open.labels).toEqual({ type: "Deals", field: "Value", group: "Stage" });
    expect(open.measure.source.filters).toEqual([
      {
        fieldId: id("deal.stage"),
        operator: "notIn",
        value: null,
        values: [id("deal.stage.won"), id("deal.stage.lost")].map((value) => ({ kind: "select", value })),
      },
    ]);
    expect(deals[1].measure.source.filters[0]?.values).toEqual([{ kind: "select", value: id("deal.stage.lost") }]);
    expect(deals[2].measure.groupBy).toEqual({ path: [], fieldId: "system:createdAt", dateInterval: "month" });
    expect(deals[2].labels.date).toBe(WIDGET_GALLERY_CREATED_AT_LABEL);
    expect(deals[3].measure.groupBy?.path).toEqual([{ relationId: id("deal.organizations"), direction: "outgoing" }]);
    expect(deals[3].labels.related).toBe("Organizations");
    const services = templates.filter((template) => template.measure.source.typeId === id("service"));
    expect(services.map((template) => template.recipe)).toEqual(["valueTotal", "valueOverTime"]);
    const tasks = templates.find((template) => template.recipe === "openCountPerAssignee");
    expect(tasks?.measure.source.filters).toEqual([
      {
        fieldId: status.id,
        operator: "notIn",
        value: null,
        values: status.options.slice(2).map((option) => ({ kind: "select", value: option.id })),
      },
    ]);
    expect(templates.some((template) => template.measure.source.typeId === id("lineItem"))).toBe(false);
  });

  it("builds starters for a model without any CRM types", () => {
    const { model, candidates, salary, stage, applied, recruiter, appliedFor } = recruitingModel();
    const templates = resolveWidgetGallery(model);
    expectValid(model, templates);
    expect(templates.map((template) => template.recipe)).toEqual([
      "valueTotal",
      "stageFunnel",
      "valueOverTime",
      "topRelatedByValue",
      "countPerMember",
    ]);
    expect(templates.every((template) => template.measure.source.typeId === candidates.id)).toBe(true);
    expect(templates[0].measure).toMatchObject({ aggregation: "sum", valueFieldId: salary.id, groupBy: null });
    expect(templates[1].measure.groupBy).toEqual({ path: [], fieldId: stage.id });
    expect(templates[2].measure.groupBy).toEqual({ path: [], fieldId: applied.id, dateInterval: "month" });
    expect(templates[2].labels).toEqual({ type: "Candidates", field: "Expected salary", date: "Applied on" });
    expect(templates[3].measure.groupBy?.path).toEqual([{ relationId: appliedFor.id, direction: "outgoing" }]);
    expect(templates[3].labels.related).toBe("Roles");
    expect(templates[4].measure.groupBy).toEqual({ path: [], fieldId: recruiter.id });
  });

  it("skips starters whose ingredients are missing", () => {
    const { model, salary, stage } = recruitingModel();
    const withoutValue = { ...model, fields: model.fields.filter((candidate) => candidate.id !== salary.id) };
    const recipes = resolveWidgetGallery(withoutValue).map((template) => template.recipe);
    expect(recipes).toEqual(["stageFunnel", "countPerMember"]);
    expect(recipes.some((recipe) => /value/i.test(recipe))).toBe(false);

    const twoOptions = {
      ...model,
      fields: model.fields.map((candidate) =>
        candidate.id === stage.id ? { ...candidate, options: candidate.options.slice(0, 2) } : candidate,
      ),
    };
    expect(resolveWidgetGallery(twoOptions).map((template) => template.recipe)).toContain("countBySelect");
    const unordered = {
      ...model,
      types: model.types.map((candidate) => ({ ...candidate, defaults: { ...candidate.defaults, groupBy: null } })),
    };
    const plainSelect = resolveWidgetGallery(unordered).find((template) => template.recipe === "countBySelect");
    expect(plainSelect?.displayOptions.displayType).toBe(DisplayType.verticalBarChart);

    const archived = { ...model, fields: model.fields.map((candidate) => ({ ...candidate, archived: true })) };
    expect(resolveWidgetGallery(archived)).toEqual([]);
  });

  it("caps the list and keys every starter uniquely", () => {
    const { model } = crmModel();
    const templates = resolveWidgetGallery(model);
    expect(new Set(templates.map((template) => template.key)).size).toBe(templates.length);
    expect(templates[0].displayOptions.displayType).toBe(DisplayType.number);
  });
});
