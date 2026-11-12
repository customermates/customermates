import type { TemplateAcceptanceCheck, TemplateLocale, TemplateRule, TemplateSpec } from "./template-spec.schema";

import { needText, planField, planFilters } from "./compile-template-support";
import { camelFieldRef, camelKey } from "./template-keys";

export type CompiledRule = {
  key: string;
  title: string;
  description: string;
  trigger: TemplateRule["trigger"];
  condition: TemplateRule["condition"];
  action: TemplateRule["action"];
  dueOffsetDays: number;
  needs: TemplateRule["needs"];
};

export type CompiledSavedView = {
  key: string;
  name: string;
  list: string;
  layout: "table" | "board";
  groupBy: string | null;
  sort: { field: string; direction: "asc" | "desc" } | null;
  columns: string[];
  summaries: Array<{ field: string; aggregation: "sum" | "average" | "min" | "max" }>;
  filters: ReturnType<typeof planFilters>;
};

export type CompiledPostBuildField = { field: string; label: string; valueType: "file" };
export type CompiledAcceptanceCheck = {
  key: string;
  kind: TemplateAcceptanceCheck["kind"];
  ref: string;
  statement: string;
};

export type TemplateExtras = {
  rules: CompiledRule[];
  savedViews: CompiledSavedView[];
  postBuildFields: CompiledPostBuildField[];
  acceptanceChecks: CompiledAcceptanceCheck[];
};

function camelTrigger(trigger: TemplateRule["trigger"]): TemplateRule["trigger"] {
  switch (trigger.kind) {
    case "record_created":
      return { kind: trigger.kind, list: camelKey(trigger.list) };
    case "field_changed":
      return {
        kind: trigger.kind,
        field: camelFieldRef(trigger.field),
        ...(trigger.to ? { to: camelKey(trigger.to) } : {}),
      };
    case "date_reached":
      return { kind: trigger.kind, field: camelFieldRef(trigger.field), offsetDays: trigger.offsetDays };
    case "unchanged_for":
      return { kind: trigger.kind, field: camelFieldRef(trigger.field), days: trigger.days };
    case "schedule":
      return {
        kind: trigger.kind,
        every: trigger.every,
        ...(trigger.weekday ? { weekday: trigger.weekday } : {}),
        ...(trigger.list ? { list: camelKey(trigger.list) } : {}),
      };
    case "form_submitted":
      return { kind: trigger.kind, form: camelKey(trigger.form) };
    case "webhook_received":
      return { kind: trigger.kind, source: camelKey(trigger.source) };
  }
}

function camelCondition(condition: TemplateRule["condition"][number]): TemplateRule["condition"][number] {
  if (condition.operator === "in" || condition.operator === "notIn") {
    return {
      operator: condition.operator,
      field: camelFieldRef(condition.field),
      options: condition.options.map(camelKey),
    };
  }
  if (condition.operator === "olderThanDays")
    return { operator: condition.operator, field: camelFieldRef(condition.field), days: condition.days };
  return { operator: condition.operator, field: camelFieldRef(condition.field) };
}

function camelAction(action: TemplateRule["action"]): TemplateRule["action"] {
  switch (action.kind) {
    case "create_task":
      return {
        kind: action.kind,
        taskKind: camelKey(action.taskKind),
        assignee: action.assignee,
        ...(action.about ? { about: camelKey(action.about) } : {}),
      };
    case "notify":
      return action;
    case "add_calendar_event":
      return { kind: action.kind, dateField: camelFieldRef(action.dateField) };
    case "create_records":
      return { kind: action.kind, lists: action.lists.map(camelKey) };
    case "set_dates":
      return {
        kind: action.kind,
        dates: action.dates.map((date) => ({ field: camelFieldRef(date.field), offsetDays: date.offsetDays })),
      };
  }
}

function compileRules(spec: TemplateSpec, text: TemplateLocale): CompiledRule[] {
  return spec.followUpRules.map((rule) => {
    const copy = needText(text.rules, rule.key, "rules");
    return {
      key: camelKey(rule.key),
      title: copy.title,
      description: copy.description,
      trigger: camelTrigger(rule.trigger),
      condition: rule.condition.map(camelCondition),
      action: camelAction(rule.action),
      dueOffsetDays: rule.dueOffsetDays,
      needs: rule.needs,
    };
  });
}

function compileSavedViews(spec: TemplateSpec, text: TemplateLocale): CompiledSavedView[] {
  return spec.views
    .filter((view) => !view.default)
    .map((view) => ({
      key: camelKey(view.key),
      name: needText(text.views, view.key, "views").name,
      list: camelKey(view.list),
      layout: view.layout,
      groupBy: view.groupBy ? planField(view.groupBy) : null,
      sort: view.sort ? { field: planField(view.sort.field), direction: view.sort.direction } : null,
      columns: view.columns.map(camelFieldRef),
      summaries: view.summaries.map((summary) => ({
        field: camelFieldRef(summary.field),
        aggregation: summary.aggregation,
      })),
      filters: planFilters(view.filters),
    }));
}

function compilePostBuildFields(spec: TemplateSpec, text: TemplateLocale): CompiledPostBuildField[] {
  return spec.fields
    .filter((field) => field.type === "file")
    .map((field) => ({
      field: camelFieldRef(field.key),
      label: needText(text.fields, field.key, "fields").label,
      valueType: "file",
    }));
}

function checkRef(check: TemplateAcceptanceCheck): string {
  return check.kind === "field_exists" ? camelFieldRef(check.ref) : camelKey(check.ref);
}

function compileAcceptanceChecks(spec: TemplateSpec, text: TemplateLocale): CompiledAcceptanceCheck[] {
  return spec.acceptanceChecks.map((check) => ({
    key: camelKey(check.key),
    kind: check.kind,
    ref: checkRef(check),
    statement: needText(text.acceptanceChecks, check.key, "acceptanceChecks"),
  }));
}

export function compileTemplateExtras(spec: TemplateSpec, text: TemplateLocale): TemplateExtras {
  return {
    rules: compileRules(spec, text),
    savedViews: compileSavedViews(spec, text),
    postBuildFields: compilePostBuildFields(spec, text),
    acceptanceChecks: compileAcceptanceChecks(spec, text),
  };
}
