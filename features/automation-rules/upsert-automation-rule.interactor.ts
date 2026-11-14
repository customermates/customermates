import { z } from "zod";

import type { Validated } from "@/core/validation/validation.utils";
import type { AutomationPlanLimits, AutomationRecordPort } from "./automation-ports";
import type { AutomationRuleRepo, StoredAutomationRule } from "./automation-rule.repo";
import type { AutomationRuleDto, UpsertAutomationRuleData } from "./automation-rule.schema";

import { Resource } from "@/generated/prisma";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { fail, failAuthorization, failConflict, failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

import { automationModelIssues } from "./automation-model-validation";
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
    const modelIssue = automationModelIssues(state, await this.records.model())[0];
    if (modelIssue) return fail(CustomErrorCode.automationRuleInvalid, modelIssue.split("."));

    if (state.enabled && !previous?.enabled) {
      const allowance = await this.limits.activeRuleAllowance();
      if (allowance.limit !== null && (await this.repo.countActiveRules(previous?.id)) >= allowance.limit) {
        return failConflict(CustomErrorCode.automationRuleLimitReached, [], {
          limit: allowance.limit,
          price: allowance.price,
        });
      }
    }

    const saved = await this.repo.saveRule({
      id: previous?.id,
      name: state.name,
      enabled: state.enabled,
      ownerUserId: this.user.id,
      triggerKind: state.trigger.kind,
      typeId: triggerTypeId(state.trigger),
      trigger: state.trigger,
      conditions: state.conditions,
      effects: state.effects,
    });
    return { ok: true as const, data: toAutomationRuleDto(saved) };
  }
}
