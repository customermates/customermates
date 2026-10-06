import { z } from "zod";

import type { RecordField, RecordModel, RecordRelationship, RecordType } from "@/features/records/record-model.schema";
import type { RecordMeasure } from "@/features/records/record-measure.schema";

import { RECORD_MEASURE_MAX_GROUP_LIMIT, RecordMeasureSchema } from "@/features/records/record-measure.schema";
import { ChartColor, DisplayType, WidgetDisplayOptionsSchema } from "./widget-display.schema";

export const WIDGET_STARTER_RECIPES = [
  "openValueTotal",
  "valueTotal",
  "stageFunnel",
  "openCountPerAssignee",
  "wonValueOverTime",
  "valueOverTime",
  "topRelatedByWonValue",
  "topRelatedByValue",
  "countPerMember",
  "countBySelect",
] as const;
export type WidgetStarterRecipe = (typeof WIDGET_STARTER_RECIPES)[number];

export const WIDGET_GALLERY_LIMIT = 9;
export const WIDGET_GALLERY_CREATED_AT_LABEL = "system:createdAt";

export const WidgetGalleryLabelsSchema = z
  .object({
    type: z.string(),
    field: z.string().optional(),
    group: z.string().optional(),
    related: z.string().optional(),
    date: z.string().optional(),
  })
  .strict();
export type WidgetGalleryLabels = z.infer<typeof WidgetGalleryLabelsSchema>;

export const WidgetGalleryTemplateSchema = z
  .object({
    key: z.string().min(1).max(400),
    recipe: z.enum(WIDGET_STARTER_RECIPES),
    labels: WidgetGalleryLabelsSchema,
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

function selectFilter(field: RecordField, operator: "in" | "notIn", optionIds: string[]) {
  return {
    fieldId: field.id,
    operator,
    value: null,
    values: optionIds.map((value) => ({ kind: "select" as const, value })),
  };
}

const isSingleSelect = (field: RecordField) => field.valueType === "select" && !field.multiple;
const isValue = (field: RecordField) => ["currency", "number"].includes(field.valueType) && !field.multiple;
const isDate = (field: RecordField) => ["date", "dateTime"].includes(field.valueType) && !field.multiple;
const isMember = (field: RecordField) => field.valueType === "member" && !field.multiple;

function outcomes(field: RecordField, closedLabels: Set<string>) {
  const won = field.options.filter((option) => probability(option) === 100).map((option) => option.id);
  const lost = field.options.filter((option) => probability(option) === 0).map((option) => option.id);
  const labelled = field.options
    .filter((option) => closedLabels.has(option.label.trim().toLocaleLowerCase()))
    .map((option) => option.id);
  const closed = [...new Set([...won, ...lost, ...labelled])];
  return { won, lost, closed, open: field.options.filter((option) => !closed.includes(option.id)) };
}

type TypeShape = {
  type: RecordType;
  value?: RecordField;
  stage?: RecordField;
  pipeline: boolean;
  status?: RecordField;
  date?: RecordField;
  member?: RecordField;
  relations: Array<{ relation: RecordRelationship; related: RecordType }>;
};

function referencedProbabilityFields(model: RecordModel, typeId: string): string[] {
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

function describeType(model: RecordModel, type: RecordType, closedLabels: Set<string>): TypeShape {
  const fields = model.fields
    .filter((field) => field.typeId === type.id && !field.archived)
    .sort((left, right) => left.position - right.position);
  const selects = fields.filter((field) => isSingleSelect(field) && field.options.length >= 2);
  const referenced = referencedProbabilityFields(model, type.id);
  const pipeline =
    selects.find((field) => referenced.includes(field.id)) ??
    selects.find((field) => field.options.some((option) => probability(option) !== null)) ??
    selects.find((field) => field.id === type.defaults.groupBy);
  const status = selects.find((field) => {
    const { closed } = outcomes(field, closedLabels);
    return closed.length > 0 && closed.length < field.options.length;
  });
  const inbound = (typeId: string) =>
    model.relationships.filter((relation) => !relation.archived && relation.targetTypeId === typeId).length;
  const relations = model.relationships
    .filter(
      (relation) => !relation.archived && (relation.sourceTypeId === type.id || relation.targetTypeId === type.id),
    )
    .flatMap((relation) => {
      const relatedId = relation.sourceTypeId === type.id ? relation.targetTypeId : relation.sourceTypeId;
      const related = model.types.find(
        (candidate) => candidate.id === relatedId && !candidate.archived && !candidate.embedded,
      );
      return related && related.id !== type.id && inbound(related.id) > 0 ? [{ relation, related }] : [];
    })
    .sort(
      (left, right) =>
        inbound(right.related.id) - inbound(left.related.id) || left.related.position - right.related.position,
    );
  return {
    type,
    value: fields.find((field) => field.valueType === "currency" && !field.multiple) ?? fields.find(isValue),
    stage: pipeline ?? selects[0],
    pipeline: Boolean(pipeline),
    status,
    date: fields.find(isDate),
    member: fields.find(isMember),
    relations,
  };
}

export function resolveWidgetGallery(model: RecordModel, closedLabels: string[] = []): WidgetGalleryTemplate[] {
  const closedSet = new Set(closedLabels.map((label) => label.trim().toLocaleLowerCase()));
  const perType: WidgetGalleryTemplate[][] = [];
  const types = model.types
    .filter((type) => !type.archived && !type.embedded)
    .sort((left, right) => left.position - right.position);

  types.forEach((type) => {
    const candidates: WidgetGalleryTemplate[] = [];
    perType.push(candidates);
    const shape = describeType(model, type, closedSet);
    const add = (
      recipe: WidgetStarterRecipe,
      ingredients: string[],
      labels: Omit<WidgetGalleryLabels, "type">,
      measure: Omit<RecordMeasure, "groupLimit">,
      displayType: DisplayType,
    ) =>
      candidates.push({
        key: [recipe, type.id, ...ingredients].join(":"),
        recipe,
        labels: { type: type.pluralLabel, ...labels },
        measure: { groupLimit: measure.groupBy?.dateInterval ? RECORD_MEASURE_MAX_GROUP_LIMIT : 100, ...measure },
        displayOptions: display(displayType),
      });
    const source = (filters: RecordMeasure["source"]["filters"] = []) => ({
      typeId: type.id,
      filters,
      relationships: [],
    });
    const stageOutcomes = shape.stage ? outcomes(shape.stage, closedSet) : null;

    if (shape.value) {
      const field = { field: shape.value.label };
      if (shape.stage && stageOutcomes?.closed.length && stageOutcomes.open.length) {
        add(
          "openValueTotal",
          [shape.value.id, shape.stage.id],
          { ...field, group: shape.stage.label },
          {
            source: source([selectFilter(shape.stage, "notIn", stageOutcomes.closed)]),
            aggregation: "sum",
            valueFieldId: shape.value.id,
            groupBy: null,
          },
          DisplayType.number,
        );
      } else {
        add(
          "valueTotal",
          [shape.value.id],
          field,
          { source: source(), aggregation: "sum", valueFieldId: shape.value.id, groupBy: null },
          DisplayType.number,
        );
      }
    }

    if (shape.stage) {
      const ordered = shape.pipeline && shape.stage.options.length - (stageOutcomes?.lost.length ?? 0) >= 3;
      add(
        ordered ? "stageFunnel" : "countBySelect",
        [shape.stage.id],
        { group: shape.stage.label },
        {
          source: source(stageOutcomes?.lost.length ? [selectFilter(shape.stage, "notIn", stageOutcomes.lost)] : []),
          aggregation: "count",
          valueFieldId: null,
          groupBy: { path: [], fieldId: shape.stage.id },
        },
        ordered ? DisplayType.funnelChart : DisplayType.verticalBarChart,
      );
    }

    if (shape.value) {
      const wonFilter =
        shape.stage && stageOutcomes?.won.length ? [selectFilter(shape.stage, "in", stageOutcomes.won)] : null;
      const dateFieldId = shape.date?.id ?? "system:createdAt";
      add(
        wonFilter ? "wonValueOverTime" : "valueOverTime",
        [shape.value.id, dateFieldId],
        { field: shape.value.label, date: shape.date?.label ?? WIDGET_GALLERY_CREATED_AT_LABEL },
        {
          source: source(wonFilter ?? []),
          aggregation: "sum",
          valueFieldId: shape.value.id,
          groupBy: { path: [], fieldId: dateFieldId, dateInterval: "month" },
        },
        DisplayType.areaChart,
      );

      const target = shape.relations[0];
      if (target) {
        const outgoing = target.relation.sourceTypeId === type.id;
        add(
          wonFilter ? "topRelatedByWonValue" : "topRelatedByValue",
          [shape.value.id, target.relation.id],
          { field: shape.value.label, related: target.related.pluralLabel },
          {
            source: source(wonFilter ?? []),
            aggregation: "sum",
            valueFieldId: shape.value.id,
            groupBy: {
              path: [{ relationId: target.relation.id, direction: outgoing ? "outgoing" : "incoming" }],
              fieldId: null,
            },
          },
          DisplayType.rankedTable,
        );
      }
    }

    if (shape.member) {
      add(
        "countPerMember",
        [shape.member.id],
        { group: shape.member.label },
        {
          source: source(),
          aggregation: "count",
          valueFieldId: null,
          groupBy: { path: [], fieldId: shape.member.id },
        },
        DisplayType.horizontalBarChart,
      );
    } else if (shape.status && !shape.value) {
      const { closed } = outcomes(shape.status, closedSet);
      add(
        "openCountPerAssignee",
        [shape.status.id],
        { group: shape.status.label },
        {
          source: source([selectFilter(shape.status, "notIn", closed)]),
          aggregation: "count",
          valueFieldId: null,
          groupBy: { path: [], fieldId: "system:assignedTo" },
        },
        DisplayType.horizontalBarChart,
      );
    }
  });

  const rank = (template: WidgetGalleryTemplate) => WIDGET_STARTER_RECIPES.indexOf(template.recipe);
  const lists = perType
    .map((list) => [...list].sort((left, right) => rank(left) - rank(right)))
    .sort((left, right) => right.length - left.length);
  const picked: WidgetGalleryTemplate[] = [];
  for (let round = 0; picked.length < WIDGET_GALLERY_LIMIT && lists.some((list) => list[round]); round += 1)
    for (const list of lists) if (list[round] && picked.length < WIDGET_GALLERY_LIMIT) picked.push(list[round]);
  return picked;
}
