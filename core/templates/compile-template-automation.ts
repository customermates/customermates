import type { CompiledRule } from "./compile-template-extras";
import type { TemplateSpec } from "./template-spec.schema";

import { templateRoleList } from "./template-fields";
import { camelKey } from "./template-keys";

export type AutomationProposalTrigger =
  | { kind: "recordCreated"; list: string }
  | { kind: "fieldChanged"; field: string; to?: string }
  | { kind: "dateReached"; field: string; days: number; direction: "before" | "after" }
  | { kind: "formSubmitted"; form: string }
  | { kind: "webhookReceived"; source: string };

export type AutomationProposalCondition = {
  field: string;
  operator: "in" | "notIn" | "empty" | "notEmpty" | "before";
  values?: string[];
  relativeDays?: number;
};

export type AutomationProposalEffect =
  | {
      kind: "createRecord";
      list: string;
      taskKind: string;
      title: string;
      dueInDays: number;
      assignToRuleOwner: boolean;
      assignedToRecordOwner: boolean;
      linkTo: string | null;
    }
  | { kind: "notify"; recipients: { ruleOwner: boolean; assignees: boolean }; title: string };

export type AutomationProposal =
  | {
      key: string;
      name: string;
      supported: true;
      trigger: AutomationProposalTrigger;
      conditions: AutomationProposalCondition[];
      effects: AutomationProposalEffect[];
    }
  | { key: string; name: string; supported: false; reason: string };

const AGENT_ROUTINE = "This rule runs through an agent routine, not through the rules engine.";
const NO_TRIGGER: Partial<Record<CompiledRule["trigger"]["kind"], string>> = {
  unchanged_for: "The rules engine has no trigger for a field that stayed unchanged.",
  schedule: "The rules engine has no recurring schedule trigger.",
};
const NO_ACTION: Partial<Record<CompiledRule["action"]["kind"], string>> = {
  set_dates: "The rules engine cannot set a date relative to today.",
  add_calendar_event: "Calendar events come from the calendar capability, not from the rules engine.",
  create_records: "The form or the incoming webhook creates these records itself.",
};

export function ruleEngineGap(rule: {
  trigger: { kind: string };
  action: { kind: string };
}): "routine" | "unavailable" | null {
  if (rule.action.kind === "add_calendar_event") return "unavailable";
  if (rule.trigger.kind in NO_TRIGGER || rule.action.kind === "set_dates") return "routine";
  return null;
}

function mapTrigger(trigger: CompiledRule["trigger"]): AutomationProposalTrigger | null {
  switch (trigger.kind) {
    case "record_created":
      return { kind: "recordCreated", list: trigger.list };
    case "field_changed":
      return { kind: "fieldChanged", field: trigger.field, ...(trigger.to ? { to: trigger.to } : {}) };
    case "date_reached":
      return {
        kind: "dateReached",
        field: trigger.field,
        days: Math.abs(trigger.offsetDays),
        direction: trigger.offsetDays < 0 ? "before" : "after",
      };
    case "form_submitted":
      return { kind: "formSubmitted", form: trigger.form };
    case "webhook_received":
      return { kind: "webhookReceived", source: trigger.source };
    default:
      return null;
  }
}

function mapCondition(condition: CompiledRule["condition"][number]): AutomationProposalCondition {
  switch (condition.operator) {
    case "in":
    case "notIn":
      return { field: condition.field, operator: condition.operator, values: condition.options };
    case "empty":
    case "notEmpty":
      return { field: condition.field, operator: condition.operator };
    case "passed":
      return { field: condition.field, operator: "before", relativeDays: 0 };
    case "olderThanDays":
      return { field: condition.field, operator: "before", relativeDays: -condition.days };
  }
}

function mapEffect(rule: CompiledRule, tasksList: string): AutomationProposalEffect | null {
  const action = rule.action;
  if (action.kind === "create_task") {
    return {
      kind: "createRecord",
      list: tasksList,
      taskKind: action.taskKind,
      title: rule.title,
      dueInDays: rule.dueOffsetDays,
      assignToRuleOwner: action.assignee === "workspace_owner",
      assignedToRecordOwner: action.assignee === "record_owner",
      linkTo: action.about ?? null,
    };
  }
  if (action.kind === "notify") {
    return {
      kind: "notify",
      recipients: { ruleOwner: action.recipient === "workspace_owner", assignees: action.recipient === "record_owner" },
      title: rule.title,
    };
  }
  return null;
}

function unsupported(rule: CompiledRule, reason: string): AutomationProposal {
  return { key: rule.key, name: rule.title, supported: false, reason };
}

export function compileTemplateAutomation(spec: TemplateSpec, rules: CompiledRule[]): AutomationProposal[] {
  const tasksList = camelKey(templateRoleList(spec, "tasks") ?? "actions");
  return rules.map((rule) => {
    if (rule.needs === "today") return unsupported(rule, AGENT_ROUTINE);
    const triggerReason = NO_TRIGGER[rule.trigger.kind];
    if (triggerReason) return unsupported(rule, triggerReason);
    const actionReason = NO_ACTION[rule.action.kind];
    if (actionReason) return unsupported(rule, actionReason);
    const trigger = mapTrigger(rule.trigger);
    const effect = mapEffect(rule, tasksList);
    if (!trigger || !effect) return unsupported(rule, "The rules engine has no matching trigger or effect.");
    return {
      key: rule.key,
      name: rule.title,
      supported: true,
      trigger,
      conditions: rule.condition.map(mapCondition),
      effects: [effect],
    };
  });
}
