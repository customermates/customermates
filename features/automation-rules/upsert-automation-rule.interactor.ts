import { z } from "zod";

import type { Validated } from "@/core/validation/validation.utils";
import type { AutomationAgentJobQueue, AutomationPlanLimits, AutomationRecordPort } from "./automation-ports";
import type { AutomationRuleRepo, StoredAutomationRule } from "./automation-rule.repo";
import type { AutomationEffect, AutomationRuleDto, UpsertAutomationRuleData } from "./automation-rule.schema";
import type { ResolvedSteps } from "./automation-step-references";
import type { AgentRuntimeAvailabilitySource } from "./get-agent-runtime-availability.interactor";

import { Resource } from "@/generated/prisma";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { fail, failAuthorization, failConflict, failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

import { AUTOMATION_DISABLED_REASON_BY_USER } from "./automation-disabled-reason";
import { automationConditionIssues, automationModelIssues } from "./automation-model-validation";
import { ruleConditionPlan } from "./automation-record-trigger";
import { toAutomationRuleDto } from "./automation-rule-dto";
import {
  AutomationConditionSchema,
  AutomationEffectSchema,
  AutomationRuleDtoSchema,
  AutomationTriggerSchema,
  UpsertAutomationRuleSchema,
  automationRuleFinalStateIssues,
  triggerTypeId,
} from "./automation-rule.schema";
import { needsAgentRuntimes, resolveStepReferences } from "./automation-step-references";

function mergeFinalState(previous: StoredAutomationRule | null, update: UpsertAutomationRuleData) {
  return {
    name: update.name ?? previous?.name ?? "",
    enabled: update.enabled ?? previous?.enabled ?? true,
    trigger: update.trigger ?? AutomationTriggerSchema.parse(previous?.trigger),
    conditions: update.conditions ?? z.array(AutomationConditionSchema).parse(previous?.conditions ?? []),
    effects: update.effects ?? z.array(AutomationEffectSchema).parse(previous?.effects),
  };
}

@TenantInteractor({ resource: Resource.routines, manage: "upsert" })
export class UpsertAutomationRuleInteractor extends AuthenticatedInteractor<
  UpsertAutomationRuleData,
  AutomationRuleDto
> {
  constructor(
    private readonly repo: AutomationRuleRepo,
    private readonly records: AutomationRecordPort,
    private readonly limits: AutomationPlanLimits,
    private readonly runtimes: AgentRuntimeAvailabilitySource | null = null,
    private readonly agentJobs: AutomationAgentJobQueue | null = null,
    private readonly clock: () => Date = () => new Date(),
  ) {
    super();
  }

  @Write({ input: UpsertAutomationRuleSchema, output: AutomationRuleDtoSchema })
  async invoke(data: UpsertAutomationRuleData): Validated<AutomationRuleDto> {
    const previous = data.id ? await this.repo.findRule(data.id) : null;
    if (data.id && !previous) return failNotFound(CustomErrorCode.automationRuleNotFound, ["id"]);
    if (previous && previous.ownerUserId !== this.user.id)
      return failAuthorization(CustomErrorCode.automationRuleEditNotOwner, ["id"]);

    const state = mergeFinalState(previous, data);
    const finalIssue = automationRuleFinalStateIssues(state)[0];
    if (finalIssue) return fail(CustomErrorCode.automationRuleInvalid, [finalIssue]);
    const model = await this.records.model();
    const modelIssue = automationModelIssues(state, model)[0] ?? automationConditionIssues(state, model)[0];
    if (modelIssue) return fail(CustomErrorCode.automationRuleInvalid, modelIssue.split("."));
    const steps = await this.resolveSteps(state.effects);
    if (!steps.ok) return fail(steps.issue.code, steps.issue.path, { reason: steps.issue.reason });

    if (state.enabled && !previous?.enabled) {
      const allowance = await this.limits.activeRuleAllowance();
      if (allowance.limit !== null && (await this.repo.countActiveRules(previous?.id)) >= allowance.limit) {
        return failConflict(CustomErrorCode.automationRuleLimitReached, [], {
          limit: allowance.limit,
          price: allowance.price,
        });
      }
    }

    const switchedOff = previous?.enabled === true && !state.enabled;
    const saved = await this.repo.saveRule(
      {
        id: previous?.id,
        name: state.name,
        enabled: state.enabled,
        ...(switchedOff ? { disabledReason: AUTOMATION_DISABLED_REASON_BY_USER } : {}),
        ownerUserId: this.user.id,
        triggerKind: state.trigger.kind,
        typeId: triggerTypeId(state.trigger),
        trigger: state.trigger,
        conditions: state.conditions,
        effects: steps.effects,
      },
      ruleConditionPlan(state.trigger, state.conditions, model).subscription,
    );
    if (switchedOff && this.agentJobs) {
      await this.agentJobs.cancelQueuedForRuleUnscoped({
        companyId: this.companyId,
        ruleId: saved.id,
        now: this.clock(),
      });
    }
    return { ok: true as const, data: toAutomationRuleDto(saved) };
  }

  private async resolveSteps(effects: AutomationEffect[]): Promise<ResolvedSteps> {
    const webhookIds = new Set<string>();
    for (const effect of effects) {
      if (effect.kind !== "callWebhook" || webhookIds.has(effect.webhookId)) continue;
      if (await this.repo.findOutboundWebhookUnscoped(this.user.companyId, effect.webhookId))
        webhookIds.add(effect.webhookId);
    }
    const runtimes = this.runtimes && needsAgentRuntimes(effects) ? await this.runtimes.availability() : null;
    return resolveStepReferences(effects, { runtimes, webhookIds });
  }
}
