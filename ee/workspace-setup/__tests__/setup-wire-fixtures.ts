import type { SetupPlan, SetupPlanInput } from "@/features/workspace-setup/setup-plan.schema";
import type { PlanKnowledgeWire, PlanModelWire, PlanViewsWire, PlanWire } from "../workspace-setup-wire";

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
      relationships: model.relationships,
      calculations: model.calculations.map((calculation) => ({
        ...calculation,
        expression: JSON.stringify(calculation.expression),
      })),
    },
    listDefaults: plan.listDefaults,
    sampleData: plan.sampleData,
    dashboard: {
      widgets: plan.dashboard.widgets.map((widget) => ({
        ...widget,
        size: widget.size ?? null,
        groupBy: widget.groupBy
          ? {
              path: widget.groupBy.path,
              field: widget.groupBy.field,
              dateInterval: widget.groupBy.dateInterval ?? null,
            }
          : null,
        filters: widget.filters.map((filter) => ({
          operator: filter.operator,
          field: filter.field,
          options: "options" in filter ? filter.options : [],
          days: "days" in filter ? filter.days : null,
        })),
      })),
    },
    knowledgeBase: plan.knowledgeBase,
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
