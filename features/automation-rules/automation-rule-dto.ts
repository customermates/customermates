import { z } from "zod";

import type { StoredAutomationRule, StoredAutomationRuleRun } from "./automation-rule.repo";
import type { AutomationRuleDto, AutomationRuleRunDto } from "./automation-rule.schema";

import { publicOccurrenceKey } from "./automation-occurrence";
import {
  AutomationConditionSchema,
  AutomationEffectOutcomeSchema,
  AutomationEffectSchema,
  AutomationTriggerSchema,
} from "./automation-rule.schema";

const OutcomeSchema = z.looseObject({
  effects: z.array(AutomationEffectOutcomeSchema).catch([]),
  reason: z.string().optional(),
});

export function toAutomationRuleDto(rule: StoredAutomationRule): AutomationRuleDto {
  return {
    id: rule.id,
    ownerUserId: rule.ownerUserId,
    owner: rule.owner,
    name: rule.name,
    enabled: rule.enabled,
    trigger: AutomationTriggerSchema.parse(rule.trigger),
    conditions: z.array(AutomationConditionSchema).parse(rule.conditions),
    effects: z.array(AutomationEffectSchema).parse(rule.effects),
    disabledReason: rule.disabledReason,
    lastRunAt: rule.lastRunAt?.toISOString() ?? null,
    lastRunStatus: rule.lastRunStatus,
    createdAt: rule.createdAt.toISOString(),
    updatedAt: rule.updatedAt.toISOString(),
  };
}

export function toAutomationRuleRunDto(run: StoredAutomationRuleRun, recordReadable: boolean): AutomationRuleRunDto {
  const outcome = OutcomeSchema.safeParse(run.outcome ?? {});
  const withRecord = recordReadable || run.recordId === null;
  return {
    id: run.id,
    ruleId: run.ruleId,
    status: run.status,
    triggerKind: run.triggerKind,
    typeId: run.typeId,
    recordId: withRecord ? run.recordId : null,
    occurrenceKey: publicOccurrenceKey(run.occurrenceKey, withRecord),
    effects: outcome.success ? outcome.data.effects : [],
    reason: outcome.success ? (outcome.data.reason ?? null) : null,
    error: run.error,
    scheduledFor: withRecord || run.triggerKind !== "dateReached" ? run.scheduledFor.toISOString() : null,
    finishedAt: run.finishedAt?.toISOString() ?? null,
    createdAt: run.createdAt.toISOString(),
  };
}
