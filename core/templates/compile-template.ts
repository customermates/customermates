import type { SetupNewField, SetupOption, SetupPlan, SetupWidget } from "@/features/workspace-setup/setup-plan.schema";
import type { TemplateExtras } from "./compile-template-extras";
import type {
  TemplateField,
  TemplateLocale,
  TemplateSpec,
  TemplateStage,
  TemplateWidget,
} from "./template-spec.schema";

import { localeDefaultCurrency } from "@/i18n/locale-registry";

import { compileTemplateExtras } from "./compile-template-extras";
import { needText, planExpression, planField, planFilters } from "./compile-template-support";
import { camelFieldRef, camelKey } from "./template-keys";

export type CompiledTemplate = { plan: SetupPlan; extras: TemplateExtras };

type PlanList = SetupPlan["recordModel"]["lists"][number];
type PlanListDefault = SetupPlan["listDefaults"][number];

function planLists(spec: TemplateSpec, text: TemplateLocale): PlanList[] {
  return spec.lists.map((list) => {
    const label = needText(text.lists, list.key, "lists");
    return {
      key: camelKey(list.key),
      label: label.label,
      pluralLabel: label.pluralLabel,
      description: label.description,
      icon: list.icon,
      ...(list.color ? { color: list.color } : {}),
      ...(list.role ? { role: list.role } : {}),
    };
  });
}

function fieldBase(ref: string, text: TemplateLocale) {
  const label = needText(text.fields, ref, "fields");
  return { key: camelFieldRef(ref), label: label.label, text: label };
}

function optionLabels(ref: string, text: TemplateLocale) {
  return needText(text.fields, ref, "fields").options;
}

function declaredFields(field: TemplateField, text: TemplateLocale): SetupNewField[] {
  if (field.type === "file") return [];
  const base = fieldBase(field.key, text);
  if (field.type === "dateRange") {
    const range = base.text.rangeLabels;
    if (!range) throw new Error(`Missing template text fields.${field.key}.rangeLabels`);
    return (["from", "to"] as const).map((edge) => ({
      key: `${base.key}${edge === "from" ? "From" : "To"}`,
      label: range[edge],
      valueType: "date",
      required: false,
      multiple: false,
      options: [],
    }));
  }
  const isSelect = field.type === "select";
  const labels = optionLabels(field.key, text);
  return [
    {
      key: base.key,
      label: base.label,
      valueType: field.type === "channels" ? "text" : field.type,
      required: field.required,
      multiple: field.type === "channels" ? true : field.multiple,
      options: isSelect
        ? field.options.map((option) => ({
            key: camelKey(option.key),
            label: needText(labels, option.key, `fields.${field.key}.options`),
            ...(option.color ? { color: option.color } : {}),
          }))
        : [],
    },
  ];
}

function stageField(stage: TemplateStage, text: TemplateLocale): SetupNewField {
  const base = fieldBase(stage.field, text);
  const labels = optionLabels(stage.field, text);
  return {
    key: base.key,
    label: base.label,
    valueType: "select",
    required: false,
    multiple: false,
    options: stage.items.map(
      (item): SetupOption => ({
        key: camelKey(item.key),
        label: needText(labels, item.key, `fields.${stage.field}.options`),
        ...(item.color ? { color: item.color } : {}),
        ...(item.outcome ? { outcome: item.outcome } : {}),
        ...(item.weight !== undefined ? { weight: item.weight } : {}),
      }),
    ),
  };
}

function planFields(spec: TemplateSpec, text: TemplateLocale): SetupPlan["recordModel"]["fields"] {
  return [
    ...spec.stages.map((stage) => stageField(stage, text)),
    ...spec.fields.flatMap((field) => declaredFields(field, text)),
  ];
}

function planCalculations(spec: TemplateSpec, text: TemplateLocale): SetupPlan["recordModel"]["calculations"] {
  return spec.calculations.map((calculation) => ({
    key: camelFieldRef(calculation.key),
    label: needText(text.fields, calculation.key, "fields").label,
    valueType: calculation.type,
    expression: planExpression(calculation.expression),
  }));
}

function planRelationships(spec: TemplateSpec, text: TemplateLocale): SetupPlan["recordModel"]["relationships"] {
  return spec.relationships.map((relation) => {
    const label = needText(text.relationships, relation.key, "relationships");
    return {
      key: camelKey(relation.key),
      source: camelKey(relation.source),
      target: camelKey(relation.target),
      sourceLabel: label.sourceLabel,
      targetLabel: label.targetLabel,
      sourceCardinality: relation.sourceCardinality,
      targetCardinality: relation.targetCardinality,
    };
  });
}

function planListDefaults(spec: TemplateSpec, text: TemplateLocale): PlanListDefault[] {
  return spec.views
    .filter((view) => view.default)
    .map((view) => ({
      list: camelKey(view.list),
      name: needText(text.views, view.key, "views").name,
      layout: view.layout,
      groupBy: view.groupBy ? planField(view.groupBy) : null,
      sort: view.sort ? { field: planField(view.sort.field), direction: view.sort.direction } : null,
      columns: view.columns.map(camelFieldRef),
      summaries: view.summaries.map((summary) => ({
        field: camelFieldRef(summary.field),
        aggregation: summary.aggregation,
      })),
    }));
}

function planWidget(widget: TemplateWidget, text: TemplateLocale): SetupWidget {
  const title = needText(text.widgets, widget.key, "widgets").title;
  const key = camelKey(widget.key);
  switch (widget.kind) {
    case "activity":
      return { kind: "activity", key, title };
    case "calendar":
      return {
        kind: "calendar",
        key,
        title,
        list: camelKey(widget.list),
        layout: widget.layout,
        dateField: camelFieldRef(widget.dateField),
        amountField: widget.amountField ? camelFieldRef(widget.amountField) : null,
        filters: planFilters(widget.filters),
      };
    case "map":
      return {
        kind: "map",
        key,
        title,
        list: camelKey(widget.list),
        addressField: camelFieldRef(widget.addressField),
        colorField: widget.colorField ? camelFieldRef(widget.colorField) : null,
        sizeField: widget.sizeField ? camelFieldRef(widget.sizeField) : null,
        detailField: widget.detailField ? camelFieldRef(widget.detailField) : null,
        filters: planFilters(widget.filters),
      };
    default:
      return {
        kind: "chart",
        key,
        title,
        list: camelKey(widget.list),
        aggregation: widget.aggregation,
        valueField: widget.valueField ? camelFieldRef(widget.valueField) : null,
        groupBy: widget.groupBy
          ? {
              path: widget.groupBy.path.map((step) => ({
                relationship: camelKey(step.relationship),
                direction: step.direction,
              })),
              field: widget.groupBy.field ? planField(widget.groupBy.field) : null,
              ...(widget.groupBy.dateInterval ? { dateInterval: widget.groupBy.dateInterval } : {}),
            }
          : null,
        filters: planFilters(widget.filters),
        display: widget.display,
        ...(widget.size ? { size: widget.size } : {}),
      };
  }
}

export function compileTemplate(
  spec: TemplateSpec,
  text: TemplateLocale,
  options: { country?: string | null } = {},
): CompiledTemplate {
  const plan: SetupPlan = {
    version: 1,
    workspace: { currency: localeDefaultCurrency(text.locale), dashboardAudience: spec.dashboardAudience },
    recordModel: {
      lists: planLists(spec, text),
      fields: planFields(spec, text),
      relationships: planRelationships(spec, text),
      calculations: planCalculations(spec, text),
    },
    listDefaults: planListDefaults(spec, text),
    sampleData: { lists: [] },
    dashboard: { widgets: spec.widgets.map((widget) => planWidget(widget, text)) },
    calendar: { sources: [] },
    knowledgeBase: {
      pages: spec.knowledgePages.map((page) => {
        const copy = needText(text.knowledgePages, page.key, "knowledgePages");
        return { key: camelKey(page.key), kind: page.kind, title: copy.title, sections: copy.sections };
      }),
    },
    importMapping: null,
  };
  return { plan, extras: compileTemplateExtras(spec, text, options) };
}

export function compileTemplateToSetupPlan(spec: TemplateSpec, text: TemplateLocale): SetupPlan {
  return compileTemplate(spec, text).plan;
}
