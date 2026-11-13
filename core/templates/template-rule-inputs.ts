import type { AutomationProposal } from "./compile-template-automation";
import type { SetupPlan } from "@/features/workspace-setup/setup-plan.schema";
import type { SetupResolver } from "@/features/workspace-setup/setup-references";
import type { RecordScalar } from "@/features/records/record-model.schema";
import type {
  AutomationCondition,
  AutomationEffect,
  AutomationTrigger,
  UpsertAutomationRuleInput,
} from "@/features/automation-rules/automation-rule.schema";

import {
  AUTOMATION_RULE_NAME_MAX_CHARS,
  UpsertAutomationRuleSchema,
} from "@/features/automation-rules/automation-rule.schema";
import { setupRoleList } from "@/features/workspace-setup/setup-anchors";

export type TemplateRuleDraft = {
  key: string;
  name: string;
  notes: string[];
  input: UpsertAutomationRuleInput;
};
export type TemplateRuleSkip = {
  key: string;
  name: string;
  reason: string;
  routine: boolean;
  priority: number | null;
};
export type TemplateRuleInputs = { ready: TemplateRuleDraft[]; skipped: TemplateRuleSkip[] };
export type TemplateRuleOptions = { timezone: string; atHour: number };

type Supported = Extract<AutomationProposal, { supported: true }>;
type Step<T> = { ok: true; value: T; notes?: string[] } | { ok: false; reason: string };

const TASK_TITLE_MAX_CHARS = 200;
const RECORD_NAME_SUFFIX = ": {{record.name}}";

function listOf(ref: string): string {
  return ref.split(".")[0] ?? ref;
}

function refuse<T>(reason: string): Step<T> {
  return { ok: false, reason };
}

function optionValue(resolver: SetupResolver, fieldRef: string, option: string): RecordScalar {
  return resolver.definition(fieldRef)?.multiple
    ? { kind: "selectList", value: [option] }
    : { kind: "select", value: option };
}

function missing<T>(what: string, key: string): Step<T> {
  return refuse(`${what} "${key}" does not exist in this workspace.`);
}

function mapTrigger(
  trigger: Supported["trigger"],
  resolver: SetupResolver,
  options: TemplateRuleOptions,
): Step<AutomationTrigger> {
  switch (trigger.kind) {
    case "recordCreated": {
      const typeId = resolver.list(trigger.list);
      return typeId ? { ok: true, value: { kind: "recordCreated", typeId } } : missing("The list", trigger.list);
    }
    case "fieldChanged": {
      const typeId = resolver.list(listOf(trigger.field));
      const fieldId = resolver.field(trigger.field);
      if (!typeId || !fieldId) return missing("The field", trigger.field);
      if (!trigger.to) return { ok: true, value: { kind: "fieldChanged", typeId, fieldId } };
      const to = resolver.option(trigger.field, trigger.to);
      if (!to) return missing("The option", `${trigger.field}.${trigger.to}`);
      return {
        ok: true,
        value: { kind: "fieldChanged", typeId, fieldId, to: optionValue(resolver, trigger.field, to) },
      };
    }
    case "dateReached": {
      const typeId = resolver.list(listOf(trigger.field));
      const fieldId = resolver.field(trigger.field);
      if (!typeId || !fieldId) return missing("The field", trigger.field);
      return {
        ok: true,
        value: {
          kind: "dateReached",
          typeId,
          fieldId,
          days: trigger.days,
          direction: trigger.direction,
          atHour: options.atHour,
          timezone: options.timezone,
        },
      };
    }
    case "formSubmitted":
    case "webhookReceived":
      return refuse("The form or incoming webhook has to exist first; create it, then add this rule.");
  }
}

function mapCondition(condition: Supported["conditions"][number], resolver: SetupResolver): Step<AutomationCondition> {
  const fieldId = resolver.field(condition.field);
  if (!fieldId) return missing("The field", condition.field);
  if (condition.operator === "empty" || condition.operator === "notEmpty")
    return { ok: true, value: { fieldId, operator: condition.operator } };
  if (condition.operator === "before")
    return { ok: true, value: { fieldId, operator: "before", relativeDays: condition.relativeDays ?? 0 } };
  const values: RecordScalar[] = [];
  for (const option of condition.values ?? []) {
    const id = resolver.option(condition.field, option);
    if (!id) return missing("The option", `${condition.field}.${option}`);
    values.push({ kind: "select", value: id });
  }
  if (values.length === 0) return refuse(`The condition on "${condition.field}" lists no values.`);
  return { ok: true, value: { fieldId, operator: condition.operator, values } };
}

function mapCreateRecord(
  effect: Extract<Supported["effects"][number], { kind: "createRecord" }>,
  triggerList: string | null,
  plan: SetupPlan,
  resolver: SetupResolver,
): Step<AutomationEffect> {
  const tasks = effect.list;
  const typeId = resolver.list(tasks);
  const title = resolver.field(`${tasks}.name`);
  const due = resolver.field(`${tasks}.due`);
  const kind = resolver.field(`${tasks}.kind`);
  const taskKind = resolver.option(`${tasks}.kind`, effect.taskKind);
  if (!typeId || !title) return missing("The tasks list", tasks);
  if (!due) return missing("The field", `${tasks}.due`);
  if (!kind || !taskKind) return missing("The task kind", `${tasks}.kind.${effect.taskKind}`);
  const notes: string[] = [];
  if (effect.assignedToRecordOwner)
    notes.push("The task is assigned to the rule owner: the rules engine cannot copy the record's owner.");
  const relation = effect.linkTo
    ? plan.recordModel.relationships.find(
        (candidate) =>
          (candidate.source === tasks && candidate.target === effect.linkTo) ||
          (candidate.source === effect.linkTo && candidate.target === tasks),
      )
    : undefined;
  const relationId = relation ? resolver.relationship(relation.key) : undefined;
  const link =
    relation && relationId && effect.linkTo === triggerList
      ? { relationId, direction: relation.source === tasks ? ("outgoing" as const) : ("incoming" as const) }
      : null;
  if (!link) notes.push("The task is not linked to the record: the rules engine has no relationship to link it by.");
  return {
    ok: true,
    notes,
    value: {
      kind: "createRecord",
      typeId,
      title: {
        fieldId: title,
        text: `${effect.title.slice(0, TASK_TITLE_MAX_CHARS - RECORD_NAME_SUFFIX.length)}${RECORD_NAME_SUFFIX}`,
      },
      due: { fieldId: due, offsetDays: effect.dueInDays },
      fields: [{ fieldId: kind, value: optionValue(resolver, `${tasks}.kind`, taskKind) }],
      assignToRuleOwner: effect.assignToRuleOwner || effect.assignedToRecordOwner,
      assignedUserIds: [],
      ...(link ? { link } : {}),
    },
  };
}

function mapEffect(
  effect: Supported["effects"][number],
  triggerList: string | null,
  plan: SetupPlan,
  resolver: SetupResolver,
): Step<AutomationEffect> {
  if (effect.kind === "createRecord") return mapCreateRecord(effect, triggerList, plan, resolver);
  return {
    ok: true,
    value: {
      kind: "notify",
      recipients: { ruleOwner: effect.recipients.ruleOwner, assignees: effect.recipients.assignees, userIds: [] },
      notificationKind: "ruleAlert",
      title: effect.title.slice(0, 200),
    },
  };
}

function triggerListOf(trigger: Supported["trigger"]): string | null {
  if (trigger.kind === "recordCreated") return trigger.list;
  if (trigger.kind === "fieldChanged" || trigger.kind === "dateReached") return listOf(trigger.field);
  return null;
}

function draftOf(
  proposal: Supported,
  plan: SetupPlan,
  resolver: SetupResolver,
  options: TemplateRuleOptions,
): Step<TemplateRuleDraft> {
  const trigger = mapTrigger(proposal.trigger, resolver, options);
  if (!trigger.ok) return trigger;
  const conditions: AutomationCondition[] = [];
  for (const condition of proposal.conditions) {
    const mapped = mapCondition(condition, resolver);
    if (!mapped.ok) return mapped;
    conditions.push(mapped.value);
  }
  const effects: AutomationEffect[] = [];
  const notes: string[] = [];
  const triggerList = triggerListOf(proposal.trigger);
  for (const effect of proposal.effects) {
    const mapped = mapEffect(effect, triggerList, plan, resolver);
    if (!mapped.ok) return mapped;
    effects.push(mapped.value);
    notes.push(...(mapped.notes ?? []));
  }
  const input: UpsertAutomationRuleInput = {
    name: proposal.name.slice(0, AUTOMATION_RULE_NAME_MAX_CHARS),
    enabled: true,
    trigger: trigger.value,
    conditions,
    effects,
  };
  const parsed = UpsertAutomationRuleSchema.safeParse(input);
  if (!parsed.success)
    return refuse(`The rules engine does not accept this rule at "${parsed.error.issues[0]?.path.join(".") ?? ""}".`);
  return { ok: true, value: { key: proposal.key, name: proposal.name, notes, input } };
}

export function templateRuleInputs(
  proposals: AutomationProposal[],
  plan: SetupPlan,
  resolver: SetupResolver,
  options: TemplateRuleOptions,
): TemplateRuleInputs {
  const result: TemplateRuleInputs = { ready: [], skipped: [] };
  const hasTasksList = setupRoleList(plan, "tasks") !== null;
  for (const proposal of proposals) {
    if (!proposal.supported) {
      result.skipped.push({
        key: proposal.key,
        name: proposal.name,
        reason: proposal.reason,
        routine: proposal.routine,
        priority: proposal.priority,
      });
      continue;
    }
    const draft = hasTasksList
      ? draftOf(proposal, plan, resolver, options)
      : refuse<TemplateRuleDraft>("The workspace has no tasks list.");
    if (draft.ok) result.ready.push(draft.value);
    else
      result.skipped.push({
        key: proposal.key,
        name: proposal.name,
        reason: draft.reason,
        routine: false,
        priority: null,
      });
  }
  return result;
}
