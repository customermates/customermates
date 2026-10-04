import { z } from "zod";

import type { RecordField, RecordModel } from "@/features/records/record-model.schema";
import type { RecordMeasure } from "@/features/records/record-measure.schema";

import { presetId } from "@/features/records/crm-preset";
import { RECORD_MEASURE_MAX_GROUP_LIMIT, RecordMeasureSchema } from "@/features/records/record-measure.schema";
import { ChartColor, DisplayType, WidgetDisplayOptionsSchema } from "./widget-display.schema";

export const WIDGET_GALLERY_KEYS = [
  "openPipeline",
  "dealsByStage",
  "wonValuePerMonth",
  "topOrganizationsByRevenue",
  "openTasksPerAssignee",
] as const;
export type WidgetGalleryKey = (typeof WIDGET_GALLERY_KEYS)[number];

export const WidgetGalleryTemplateSchema = z
  .object({
    key: z.enum(WIDGET_GALLERY_KEYS),
    measure: RecordMeasureSchema,
    displayOptions: WidgetDisplayOptionsSchema,
  })
  .strict();
export type WidgetGalleryTemplate = z.infer<typeof WidgetGalleryTemplateSchema>;

export const WidgetGallerySchema = z
  .object({ schemaRevision: z.number().int(), templates: z.array(WidgetGalleryTemplateSchema) })
  .strict();
export type WidgetGallery = z.infer<typeof WidgetGallerySchema>;

function display(displayType: DisplayType): WidgetGalleryTemplate["displayOptions"] {
  return {
    barColors: [ChartColor.primary1],
    displayType,
    reverseXAxis: false,
    reverseYAxis: false,
    useGroupColors: true,
    showLegend: true,
    showFilters: true,
  };
}

function probability(option: RecordField["options"][number]): number | null {
  const attribute = option.attributes.find((candidate) => candidate.key === "probability");
  return attribute?.value?.kind === "decimal" && typeof attribute.value.value === "string"
    ? Number(attribute.value.value)
    : null;
}

function referencedOptionFields(model: RecordModel, typeId: string): string[] {
  const found: string[] = [];
  const visit = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) return value.forEach(visit);
    const node = value as Record<string, unknown>;
    if (node.kind === "optionAttribute" && node.attribute === "probability" && typeof node.fieldId === "string")
      found.push(node.fieldId);
    Object.values(node).forEach(visit);
  };
  for (const field of model.fields)
    if (field.typeId === typeId && !field.archived && "expression" in field.behavior) visit(field.behavior.expression);
  return found;
}

function selectFilter(field: RecordField, operator: "in" | "notIn", optionIds: string[]) {
  return {
    fieldId: field.id,
    operator,
    value: null,
    values: optionIds.map((value) => ({ kind: "select" as const, value })),
  };
}

export function resolveWidgetGallery(
  companyId: string,
  model: RecordModel,
  closedTaskLabels: string[],
): WidgetGalleryTemplate[] {
  const id = (key: string) => presetId(companyId, key);
  const type = (key: string) => model.types.find((candidate) => candidate.id === id(key) && !candidate.archived);
  const fieldsOf = (typeId: string) =>
    model.fields
      .filter((field) => field.typeId === typeId && !field.archived)
      .sort((left, right) => left.position - right.position);
  const isSelect = (field: RecordField | undefined): field is RecordField =>
    Boolean(field && field.valueType === "select" && !field.multiple);
  const templates: WidgetGalleryTemplate[] = [];
  const template = (key: WidgetGalleryKey, measure: Omit<RecordMeasure, "groupLimit">, displayType: DisplayType) =>
    templates.push({
      key,
      measure: { groupLimit: measure.groupBy?.dateInterval ? RECORD_MEASURE_MAX_GROUP_LIMIT : 100, ...measure },
      displayOptions: display(displayType),
    });

  const deal = type("deal");
  if (deal) {
    const fields = fieldsOf(deal.id);
    const value =
      fields.find((field) => field.id === id("deal.totalValue") && field.valueType === "currency") ??
      fields.find((field) => field.valueType === "currency");
    const referenced = referencedOptionFields(model, deal.id);
    const stage =
      fields.find((field) => isSelect(field) && referenced.includes(field.id)) ??
      fields.find((field) => isSelect(field) && field.id === id("deal.stage")) ??
      fields.find((field) => isSelect(field) && field.options.some((option) => probability(option) !== null));
    const won = stage?.options.filter((option) => probability(option) === 100).map((option) => option.id) ?? [];
    const lost = stage?.options.filter((option) => probability(option) === 0).map((option) => option.id) ?? [];
    const open = stage?.options.filter((option) => ![...won, ...lost].includes(option.id)) ?? [];
    if (value && stage && won.length && lost.length && open.length) {
      template(
        "openPipeline",
        {
          source: { typeId: deal.id, filters: [selectFilter(stage, "notIn", [...won, ...lost])], relationships: [] },
          aggregation: "sum",
          valueFieldId: value.id,
          groupBy: null,
        },
        DisplayType.number,
      );
    }
    if (stage) {
      template(
        "dealsByStage",
        {
          source: {
            typeId: deal.id,
            filters: lost.length ? [selectFilter(stage, "notIn", lost)] : [],
            relationships: [],
          },
          aggregation: "count",
          valueFieldId: null,
          groupBy: { path: [], fieldId: stage.id },
        },
        DisplayType.funnelChart,
      );
    }
    if (value && stage && won.length) {
      const date = fields.find((field) => ["date", "dateTime"].includes(field.valueType) && !field.multiple);
      template(
        "wonValuePerMonth",
        {
          source: { typeId: deal.id, filters: [selectFilter(stage, "in", won)], relationships: [] },
          aggregation: "sum",
          valueFieldId: value.id,
          groupBy: { path: [], fieldId: date?.id ?? "system:createdAt", dateInterval: "month" },
        },
        DisplayType.areaChart,
      );
      const organization = type("organization");
      const relations = model.relationships.filter((relation) => !relation.archived);
      const relation = organization
        ? (relations.find(
            (relation) =>
              relation.id === id("deal.organizations") &&
              relation.sourceTypeId === deal.id &&
              relation.targetTypeId === organization.id,
          ) ??
          relations.find(
            (relation) =>
              (relation.sourceTypeId === deal.id && relation.targetTypeId === organization.id) ||
              (relation.sourceTypeId === organization.id && relation.targetTypeId === deal.id),
          ))
        : undefined;
      if (relation) {
        template(
          "topOrganizationsByRevenue",
          {
            source: { typeId: deal.id, filters: [selectFilter(stage, "in", won)], relationships: [] },
            aggregation: "sum",
            valueFieldId: value.id,
            groupBy: {
              path: [
                { relationId: relation.id, direction: relation.sourceTypeId === deal.id ? "outgoing" : "incoming" },
              ],
              fieldId: null,
            },
          },
          DisplayType.rankedTable,
        );
      }
    }
  }

  const task = type("task");
  if (task) {
    const closedIds = [id("task.status.done"), id("task.status.archived")];
    const labels = new Set(closedTaskLabels.map((label) => label.trim().toLocaleLowerCase()));
    const closed = (field: RecordField) =>
      field.options
        .filter((option) => closedIds.includes(option.id) || labels.has(option.label.trim().toLocaleLowerCase()))
        .map((option) => option.id);
    const candidates = fieldsOf(task.id).filter(isSelect);
    const status =
      candidates.find((field) => field.id === id("task.status")) ??
      candidates.find((field) => closed(field).length > 0 && closed(field).length < field.options.length);
    const done = status ? closed(status) : [];
    if (status && done.length && done.length < status.options.length) {
      template(
        "openTasksPerAssignee",
        {
          source: { typeId: task.id, filters: [selectFilter(status, "notIn", done)], relationships: [] },
          aggregation: "count",
          valueFieldId: null,
          groupBy: { path: [], fieldId: "system:assignedTo" },
        },
        DisplayType.horizontalBarChart,
      );
    }
  }
  return templates;
}
