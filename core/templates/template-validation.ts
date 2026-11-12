import type { z } from "zod";
import type { TemplateFieldInfo } from "./template-fields";
import type { TemplateFilter, TemplateRule, TemplateSpecObject } from "./template-spec.schema";

import {
  SETUP_LIST_ROLES,
  SETUP_REQUIRED_LIST_ROLES,
  setupAnchorFields,
} from "@/features/workspace-setup/setup-anchors";
import { SETUP_PLAN_LIMITS } from "@/features/workspace-setup/setup-plan.schema";

import { camelFieldRef, camelKey, refList } from "./template-keys";
import { templateFieldIndex, templateRoleList } from "./template-fields";

type Path = (string | number)[];
type Report = (path: Path, message: string) => void;
export type TemplateIssue = { path: Path; message: string };
type Index = Map<string, TemplateFieldInfo>;

const DATE_TYPES = new Set(["date", "dateTime"]);
const NUMBER_TYPES = new Set(["number", "currency"]);
const PLAN_FIELD_SKIPPED = new Set(["file"]);
const MULTIPLE_TYPES = new Set(["select", "text", "url"]);
const SYSTEM_COLUMN = /^system:/;

function distinct(keys: readonly string[], at: (index: number) => Path, report: Report, label: string) {
  const seen = new Set<string>();
  keys.forEach((key, index) => {
    const plan = camelKey(key);
    if (seen.has(plan)) report(at(index), `${label} key repeats: ${key}`);
    seen.add(plan);
  });
}

function listIssues(spec: TemplateSpecObject, report: Report) {
  distinct(
    spec.lists.map((list) => list.key),
    (index) => ["lists", index, "key"],
    report,
    "List",
  );
  spec.lists.forEach((list, index) => {
    if (camelKey(list.key) === "lineItem") report(["lists", index, "key"], "The list key is taken.");
  });
  if (spec.lists.length > SETUP_PLAN_LIMITS.lists) report(["lists"], "Too many lists.");
  for (const role of SETUP_LIST_ROLES) {
    const count = spec.lists.filter((list) => list.role === role).length;
    const required = SETUP_REQUIRED_LIST_ROLES.includes(role);
    if (required ? count !== 1 : count > 1)
      report(["lists"], `Mark ${required ? "exactly" : "at most"} one list as ${role}.`);
  }
  if (templateRoleList(spec, "offerings") && !templateRoleList(spec, "deals"))
    report(["lists"], "A list with the role offerings needs a list with the role deals.");
}

function claimField(spec: TemplateSpecObject, report: Report) {
  const lists = new Set(spec.lists.map((list) => list.key));
  const reserved = new Set([
    ...spec.lists.map((list) => `${camelKey(list.key)}.name`),
    ...setupAnchorFields(spec.lists.map((list) => ({ ...list, key: camelKey(list.key) }))),
  ]);
  const seen = new Set<string>();
  return (ref: string, path: Path) => {
    const plan = camelFieldRef(ref);
    if (!lists.has(refList(ref))) report(path, `The field belongs to an unknown list: ${ref}`);
    else if (reserved.has(plan)) report(path, `The field is added automatically: ${ref}`);
    else if (seen.has(plan)) report(path, `The field key is taken: ${ref}`);
    seen.add(plan);
  };
}

function declaredFieldIssues(spec: TemplateSpecObject, report: Report, claim: ReturnType<typeof claimField>) {
  spec.fields.forEach((field, index) => {
    const path: Path = ["fields", index];
    claim(field.key, [...path, "key"]);
    if (field.type === "dateRange") {
      claim(`${field.key}_from`, [...path, "key"]);
      claim(`${field.key}_to`, [...path, "key"]);
    }
    if (
      field.type === "channels" &&
      spec.lists.some((list) => list.role === "people" && list.key === refList(field.key))
    )
      report([...path, "type"], "The people list already has channels.");
    if ((field.type === "select") !== field.options.length > 0)
      report([...path, "options"], "Only select fields have options.");
    if (field.multiple && !MULTIPLE_TYPES.has(field.type)) report([...path, "multiple"], "This field holds one value.");
    distinct(
      field.options.map((option) => option.key),
      (position) => [...path, "options", position],
      report,
      "Option",
    );
  });
}

function stageIssues(spec: TemplateSpecObject, report: Report, claim: ReturnType<typeof claimField>) {
  spec.stages.forEach((stage, index) => {
    const path: Path = ["stages", index];
    claim(stage.field, [...path, "field"]);
    distinct(
      stage.items.map((item) => item.key),
      (position) => [...path, "items", position],
      report,
      "Stage",
    );
    const weighted = stage.items.map((item) => item.outcome !== undefined || item.weight !== undefined);
    if (weighted.some(Boolean) && !stage.items.every((item) => item.outcome !== undefined && item.weight !== undefined))
      report([...path, "items"], "Give every stage both an outcome and a weight, or none.");
    if (weighted.some(Boolean) && !stage.items.some((item) => item.outcome === "open"))
      report([...path, "items"], "A weighted stage list needs an open stage.");
  });
}

function planFieldCount(spec: TemplateSpecObject): number {
  const declared = spec.fields.reduce((sum, field) => {
    if (PLAN_FIELD_SKIPPED.has(field.type)) return sum;
    return sum + (field.type === "dateRange" ? 2 : 1);
  }, 0);
  return declared + spec.stages.length;
}

function expressionRefs(expression: TemplateSpecObject["calculations"][number]["expression"]): string[] {
  switch (expression.op) {
    case "field":
    case "optionWeight":
    case "related":
      return [expression.field];
    case "number":
      return [];
    case "daysBetween":
      return [expression.from, expression.to];
    default:
      return [...expressionRefs(expression.left), ...expressionRefs(expression.right)];
  }
}

function expressionOps(expression: TemplateSpecObject["calculations"][number]["expression"]): string[] {
  if ("left" in expression)
    return [expression.op, ...expressionOps(expression.left), ...expressionOps(expression.right)];
  return [expression.op];
}

function calculationIssues(
  spec: TemplateSpecObject,
  report: Report,
  claim: ReturnType<typeof claimField>,
  index: Index,
) {
  const relationships = new Set(spec.relationships.map((relation) => relation.key));
  spec.calculations.forEach((calculation, position) => {
    const path: Path = ["calculations", position];
    claim(calculation.key, [...path, "key"]);
    for (const ref of expressionRefs(calculation.expression))
      if (!index.has(ref)) report([...path, "expression"], `Unknown field in the calculation: ${ref}`);

    if (expressionOps(calculation.expression).length > SETUP_PLAN_LIMITS.expressionNodes)
      report([...path, "expression"], "The calculation is too large.");
    walkExpression(calculation.expression, (node) => {
      if (node.op === "optionWeight" && index.get(node.field)?.type !== "select")
        report([...path, "expression"], `optionWeight needs a select field: ${node.field}`);
      if (node.op === "related" && !relationships.has(node.relationship))
        report([...path, "expression"], `Unknown relationship: ${node.relationship}`);
    });
  });
}

function walkExpression(
  expression: TemplateSpecObject["calculations"][number]["expression"],
  visit: (node: TemplateSpecObject["calculations"][number]["expression"]) => void,
) {
  visit(expression);
  if ("left" in expression) {
    walkExpression(expression.left, visit);
    walkExpression(expression.right, visit);
  }
}

function fieldModelIssues(spec: TemplateSpecObject, report: Report, index: Index) {
  const claim = claimField(spec, report);
  declaredFieldIssues(spec, report, claim);
  stageIssues(spec, report, claim);
  calculationIssues(spec, report, claim, index);
  if (planFieldCount(spec) > SETUP_PLAN_LIMITS.fields) report(["fields"], "Too many fields.");
  if (spec.calculations.length > SETUP_PLAN_LIMITS.calculations) report(["calculations"], "Too many calculations.");
}

function relationshipIssues(spec: TemplateSpecObject, report: Report) {
  const lists = new Set(spec.lists.map((list) => list.key));
  distinct(
    spec.relationships.map((relation) => relation.key),
    (position) => ["relationships", position, "key"],
    report,
    "Relationship",
  );
  spec.relationships.forEach((relation, position) => {
    if (!lists.has(relation.source) || !lists.has(relation.target))
      report(["relationships", position], "The relationship connects an unknown list.");
  });
  if (spec.relationships.length > SETUP_PLAN_LIMITS.relationships) report(["relationships"], "Too many relationships.");
}

function checkRef(index: Index, ref: string, path: Path, report: Report, list?: string): TemplateFieldInfo | null {
  if (SYSTEM_COLUMN.test(ref)) return null;
  const info = index.get(ref);
  if (!info) report(path, `Unknown field: ${ref}`);
  else if (list && refList(ref) !== list) report(path, `The field is not in the list ${list}: ${ref}`);
  return info ?? null;
}

function filterIssues(filters: readonly TemplateFilter[], path: Path, index: Index, report: Report, list: string) {
  filters.forEach((filter, position) => {
    const at: Path = [...path, position];
    const info = checkRef(index, filter.field, [...at, "field"], report, list);
    if (!info) return;
    if (filter.operator === "in" || filter.operator === "notIn") {
      if (info.type !== "select") report([...at, "field"], `${filter.field} is not a select field.`);
      for (const option of filter.options)
        if (!info.options.includes(option)) report([...at, "options"], `Unknown option ${option} of ${filter.field}`);
    }
    if ((filter.operator === "inLastDays" || filter.operator === "notInLastDays") && !DATE_TYPES.has(info.type))
      report([...at, "field"], `${filter.field} is not a date field.`);
  });
}

function viewIssues(spec: TemplateSpecObject, report: Report, index: Index) {
  const lists = new Set(spec.lists.map((list) => list.key));
  distinct(
    spec.views.map((view) => view.key),
    (position) => ["views", position, "key"],
    report,
    "View",
  );
  const defaults = new Map<string, number>();
  spec.views.forEach((view, position) => {
    const path: Path = ["views", position];
    if (!lists.has(view.list)) return report([...path, "list"], `Unknown list: ${view.list}`);
    if (view.default) defaults.set(view.list, (defaults.get(view.list) ?? 0) + 1);
    view.columns.forEach((ref, column) => checkRef(index, ref, [...path, "columns", column], report, view.list));
    const group = view.groupBy ? checkRef(index, view.groupBy, [...path, "groupBy"], report, view.list) : null;
    if (view.layout === "board" && (!view.groupBy || (group && group.type !== "select")))
      report([...path, "groupBy"], "A board needs a select field to group by.");
    if (view.sort) checkRef(index, view.sort.field, [...path, "sort", "field"], report, view.list);
    if (view.summaries.length && !view.groupBy) report([...path, "summaries"], "Totals need a grouping.");
    view.summaries.forEach((summary, at) => {
      const info = checkRef(index, summary.field, [...path, "summaries", at], report, view.list);
      if (info && !NUMBER_TYPES.has(info.type))
        report([...path, "summaries", at], "Totals need a number or currency field.");
    });
    if (view.default && view.filters.length) report([...path, "filters"], "A default view has no filters.");
    filterIssues(view.filters, [...path, "filters"], index, report, view.list);
  });
  for (const [list, count] of defaults)
    if (count > 1) report(["views"], `The list ${list} has ${count} default views.`);
  if (defaults.size > SETUP_PLAN_LIMITS.listDefaults) report(["views"], "Too many default views.");
}

function widgetIssues(spec: TemplateSpecObject, report: Report, index: Index) {
  const lists = new Set(spec.lists.map((list) => list.key));
  const relationships = new Set(spec.relationships.map((relation) => relation.key));
  distinct(
    spec.widgets.map((widget) => widget.key),
    (position) => ["widgets", position, "key"],
    report,
    "Widget",
  );
  if (spec.widgets.length > SETUP_PLAN_LIMITS.widgets) report(["widgets"], "Too many widgets.");
  spec.widgets.forEach((widget, position) => {
    const path: Path = ["widgets", position];
    if (widget.kind === "activity") return;
    if (!lists.has(widget.list)) return report([...path, "list"], `Unknown list: ${widget.list}`);
    filterIssues(widget.filters, [...path, "filters"], index, report, widget.list);
    if (widget.kind === "calendar") {
      const info = checkRef(index, widget.dateField, [...path, "dateField"], report, widget.list);
      if (info && !DATE_TYPES.has(info.type)) report([...path, "dateField"], "A calendar needs a date field.");
      if (widget.amountField) checkRef(index, widget.amountField, [...path, "amountField"], report, widget.list);
    }
    if (widget.kind === "map") checkRef(index, widget.addressField, [...path, "addressField"], report, widget.list);
    if (widget.kind === "chart") chartIssues(widget, path, index, report, relationships);
  });
}

function chartIssues(
  widget: Extract<TemplateSpecObject["widgets"][number], { kind: "chart" }>,
  path: Path,
  index: Index,
  report: Report,
  relationships: Set<string>,
) {
  if (widget.aggregation === "count" ? widget.valueField !== null : widget.valueField === null)
    report([...path, "valueField"], "Only a count has no value field.");
  if (widget.valueField) {
    const info = checkRef(index, widget.valueField, [...path, "valueField"], report, widget.list);
    if (info && !NUMBER_TYPES.has(info.type) && !DATE_TYPES.has(info.type))
      report([...path, "valueField"], "The value field must be numeric or a date.");
  }
  const group = widget.groupBy;
  if (!group) return;
  group.path.forEach((step, at) => {
    if (!relationships.has(step.relationship))
      report([...path, "groupBy", "path", at], `Unknown relationship: ${step.relationship}`);
  });
  if (group.field)
    checkRef(index, group.field, [...path, "groupBy", "field"], report, group.path.length ? undefined : widget.list);
}

function pageIssues(spec: TemplateSpecObject, report: Report) {
  distinct(
    spec.knowledgePages.map((page) => page.key),
    (position) => ["knowledgePages", position, "key"],
    report,
    "Page",
  );
  if (spec.knowledgePages.length > SETUP_PLAN_LIMITS.pages) report(["knowledgePages"], "Too many knowledge pages.");
}

function conditionIssues(rule: TemplateRule, path: Path, index: Index, report: Report) {
  rule.condition.forEach((condition, position) => {
    const at: Path = [...path, "condition", position];
    const info = checkRef(index, condition.field, [...at, "field"], report);
    if (!info) return;
    if (condition.operator === "in" || condition.operator === "notIn") {
      if (info.type !== "select") report([...at, "field"], `${condition.field} is not a select field.`);
      for (const option of condition.options) {
        if (!info.options.includes(option))
          report([...at, "options"], `Unknown option ${option} of ${condition.field}`);
      }
    }
    if ((condition.operator === "passed" || condition.operator === "olderThanDays") && !DATE_TYPES.has(info.type))
      report([...at, "field"], `${condition.field} is not a date field.`);
  });
}

function triggerIssues(spec: TemplateSpecObject, rule: TemplateRule, path: Path, index: Index, report: Report) {
  const lists = new Set(spec.lists.map((list) => list.key));
  const trigger = rule.trigger;
  const at: Path = [...path, "trigger"];
  if (
    (trigger.kind === "record_created" || (trigger.kind === "schedule" && trigger.list)) &&
    !lists.has(trigger.list ?? "")
  )
    report([...at, "list"], `Unknown list: ${trigger.list}`);
  if (trigger.kind === "field_changed") {
    const info = checkRef(index, trigger.field, [...at, "field"], report);
    if (info && trigger.to && !info.options.includes(trigger.to))
      report([...at, "to"], `Unknown option ${trigger.to} of ${trigger.field}`);
  }
  if (trigger.kind === "unchanged_for") {
    const info = checkRef(index, trigger.field, [...at, "field"], report);
    if (info && info.type !== "select") report([...at, "field"], `${trigger.field} is not a select field.`);
  }
  if (trigger.kind === "date_reached") {
    const info = checkRef(index, trigger.field, [...at, "field"], report);
    if (info && !DATE_TYPES.has(info.type)) report([...at, "field"], `${trigger.field} is not a date field.`);
  }
}

function actionIssues(spec: TemplateSpecObject, rule: TemplateRule, path: Path, index: Index, report: Report) {
  const lists = new Set(spec.lists.map((list) => list.key));
  const action = rule.action;
  const at: Path = [...path, "action"];
  if (action.kind === "create_task") {
    const tasks = templateRoleList(spec, "tasks");
    const kinds = tasks ? index.get(`${tasks}.kind`) : undefined;
    if (!kinds || kinds.type !== "select") report(at, "create_task needs a select field kind on the tasks list.");
    else if (!kinds.options.includes(action.taskKind))
      report([...at, "taskKind"], `Unknown task kind: ${action.taskKind}`);
    if (action.about && !lists.has(action.about)) report([...at, "about"], `Unknown list: ${action.about}`);
  }
  if (action.kind === "add_calendar_event") {
    const info = checkRef(index, action.dateField, [...at, "dateField"], report);
    if (info && !DATE_TYPES.has(info.type)) report([...at, "dateField"], `${action.dateField} is not a date field.`);
  }
  if (action.kind === "create_records")
    for (const list of action.lists) if (!lists.has(list)) report([...at, "lists"], `Unknown list: ${list}`);

  if (action.kind === "set_dates") {
    action.dates.forEach((date, position) => {
      const info = checkRef(index, date.field, [...at, "dates", position, "field"], report);
      if (info && !DATE_TYPES.has(info.type))
        report([...at, "dates", position, "field"], `${date.field} is not a date field.`);
    });
  }
}

function ruleIssues(spec: TemplateSpecObject, report: Report, index: Index) {
  distinct(
    spec.followUpRules.map((rule) => rule.key),
    (position) => ["followUpRules", position, "key"],
    report,
    "Rule",
  );
  spec.followUpRules.forEach((rule, position) => {
    const path: Path = ["followUpRules", position];
    triggerIssues(spec, rule, path, index, report);
    conditionIssues(rule, path, index, report);
    actionIssues(spec, rule, path, index, report);
  });
  const needed = new Set(spec.followUpRules.flatMap((rule) => (rule.needs === "today" ? [] : [rule.needs])));
  const declared = new Set(spec.requiresCapabilities);
  const same = needed.size === declared.size && [...needed].every((need) => declared.has(need));
  if (!same) {
    report(
      ["requiresCapabilities"],
      `requiresCapabilities must equal the capabilities the rules need: ${[...needed].sort().join(", ")}`,
    );
  }
}

function acceptanceIssues(spec: TemplateSpecObject, report: Report, index: Index) {
  distinct(
    spec.acceptanceChecks.map((check) => check.key),
    (position) => ["acceptanceChecks", position, "key"],
    report,
    "Check",
  );
  const targets: Record<string, Set<string>> = {
    list_exists: new Set(spec.lists.map((list) => list.key)),
    field_exists: new Set(index.keys()),
    view_exists: new Set(spec.views.map((view) => view.key)),
    widget_exists: new Set(spec.widgets.map((widget) => widget.key)),
    rule_exists: new Set(spec.followUpRules.map((rule) => rule.key)),
    page_exists: new Set(spec.knowledgePages.map((page) => page.key)),
  };
  spec.acceptanceChecks.forEach((check, position) => {
    if (!targets[check.kind]?.has(check.ref)) {
      report(
        ["acceptanceChecks", position, "ref"],
        `The ${check.kind} check points to an unknown target: ${check.ref}`,
      );
    }
  });
}

function identityIssues(spec: TemplateSpecObject, report: Report) {
  if (spec.id !== `tpl_${spec.slug.replace(/-/g, "_")}`)
    report(["id"], "The id must be tpl_ plus the slug with underscores.");
  const locales = Object.keys(spec.status).sort();
  if (locales.join() !== Object.keys(spec.publicPage).sort().join())
    report(["publicPage"], "status and publicPage need the same locales.");
  for (const locale of Object.keys(spec.pairedPages))
    if (!locales.includes(locale)) report(["pairedPages", locale], "Unknown locale.");
  if (new Set(spec.jurisdictions).size !== spec.jurisdictions.length)
    report(["jurisdictions"], "Jurisdictions repeat.");
}

export function templateSpecIssues(spec: TemplateSpecObject): TemplateIssue[] {
  const issues: TemplateIssue[] = [];
  const report: Report = (path, message) => issues.push({ path, message });
  const index = templateFieldIndex(spec);
  identityIssues(spec, report);
  listIssues(spec, report);
  fieldModelIssues(spec, report, index);
  relationshipIssues(spec, report);
  viewIssues(spec, report, index);
  widgetIssues(spec, report, index);
  pageIssues(spec, report);
  ruleIssues(spec, report, index);
  acceptanceIssues(spec, report, index);
  return issues;
}

export function addTemplateSpecIssues(spec: TemplateSpecObject, context: z.RefinementCtx) {
  for (const issue of templateSpecIssues(spec))
    context.addIssue({ code: "custom", path: issue.path, message: issue.message });
}
