import type { SetupPlan, SetupPlanInput } from "@/features/workspace-setup/setup-plan.schema";
import type { PlanKnowledgeWire, PlanModelWire, PlanViewsWire, PlanWire } from "../workspace-setup-wire";

import { DisplayType } from "@/features/widget/widget-display.schema";
import { SetupPlanSchema } from "@/features/workspace-setup/setup-plan.schema";

type Option = SetupPlan["recordModel"]["fields"][number]["options"][number];

function wireOption(option: Option) {
  return {
    key: option.key,
    label: option.label,
    color: option.color ?? null,
    weight: option.weight ?? null,
    outcome: option.outcome ?? null,
  };
}

export function planToWire(input: SetupPlanInput): PlanWire {
  const plan = SetupPlanSchema.parse(input);
  const model = plan.recordModel;
  return {
    workspace: plan.workspace,
    recordModel: {
      lists: model.lists.map((list) => ({ ...list, color: list.color ?? null, role: list.role ?? null })),
      fields: model.fields.map((field) => ({ ...field, options: field.options.map(wireOption) })),
      relationships: model.relationships.map(({ sourceCardinality, targetCardinality, ...relation }) => ({
        ...relation,
        targetsPerSource: sourceCardinality,
        sourcesPerTarget: targetCardinality,
      })),
      calculations: model.calculations.map((calculation) => ({
        ...calculation,
        expression: JSON.stringify(calculation.expression),
      })),
    },
    listDefaults: plan.listDefaults,
    sampleData: plan.sampleData,
    dashboard: {
      widgets: plan.dashboard.widgets.map((widget) => {
        const chart = widget.kind === undefined || widget.kind === "chart" ? widget : null;
        return {
          key: widget.key,
          kind: widget.kind ?? "chart",
          title: widget.title,
          list: "list" in widget ? widget.list : "",
          calendar:
            widget.kind === "calendar"
              ? { layout: widget.layout, dateField: widget.dateField, amountField: widget.amountField }
              : null,
          map:
            widget.kind === "map"
              ? {
                  addressField: widget.addressField,
                  colorField: widget.colorField,
                  sizeField: widget.sizeField,
                  detailField: widget.detailField,
                }
              : null,
          aggregation: chart?.aggregation ?? "count",
          valueField: chart?.valueField ?? null,
          display: chart?.display ?? DisplayType.number,
          size: chart?.size ?? null,
          groupBy: chart?.groupBy
            ? {
                path: chart.groupBy.path,
                field: chart.groupBy.field,
                dateInterval: chart.groupBy.dateInterval ?? null,
              }
            : null,
          filters: ("filters" in widget ? widget.filters : []).map((filter) => ({
            operator: filter.operator,
            field: filter.field,
            options: "options" in filter ? filter.options : [],
            days: "days" in filter ? filter.days : null,
          })),
        };
      }),
    },
    calendar: {
      sources: plan.calendar.sources.map((source) => ({ ...source, endField: source.endField ?? "" })),
    },
    knowledgeBase: {
      pages: plan.knowledgeBase.pages.flatMap((page) =>
        page.kind === "competitor" ? [] : [{ ...page, kind: page.kind }],
      ),
    },
    importMapping: plan.importMapping,
  };
}

export function planToWireParts(input: SetupPlanInput): {
  model: PlanModelWire;
  views: PlanViewsWire;
  knowledge: PlanKnowledgeWire;
} {
  const wire = planToWire(input);
  return {
    model: { ...wire.workspace, ...wire.recordModel },
    views: {
      listDefaults: wire.listDefaults,
      sampleLists: wire.sampleData.lists,
      widgets: wire.dashboard.widgets,
      calendarSources: wire.calendar.sources,
      importMapping: wire.importMapping,
    },
    knowledge: wire.knowledgeBase,
  };
}

export const PLAN_PART_LABELS = {
  model: "Workspace setup plan: record model",
  views: "Workspace setup plan: views and dashboard",
  knowledge: "Workspace setup plan: Knowledge Base",
} as const;

export function planPartFor(label: string, input: SetupPlanInput): unknown {
  const parts = planToWireParts(input);
  if (label === PLAN_PART_LABELS.model) return parts.model;
  if (label === PLAN_PART_LABELS.views) return parts.views;
  if (label === PLAN_PART_LABELS.knowledge) return parts.knowledge;
  return undefined;
}
