import type { Validated } from "@/core/validation/validation.utils";
import type { AutomationPlanLimits } from "./automation-ports";
import type { AutomationRuleRepo } from "./automation-rule.repo";
import type { AutomationRuleDto, SetAutomationRuleEnabledData } from "./automation-rule.schema";

import { Resource } from "@/generated/prisma";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { failAuthorization, failConflict, failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

import { toAutomationRuleDto } from "./automation-rule-dto";
import { AutomationRuleDtoSchema, SetAutomationRuleEnabledSchema } from "./automation-rule.schema";

@TenantInteractor({ resource: Resource.routines, manage: "update" })
export class SetAutomationRuleEnabledInteractor extends AuthenticatedInteractor<
  SetAutomationRuleEnabledData,
  AutomationRuleDto
> {
  constructor(
    private readonly repo: AutomationRuleRepo,
    private readonly limits: AutomationPlanLimits,
  ) {
    super();
  }

  @Write({ input: SetAutomationRuleEnabledSchema, output: AutomationRuleDtoSchema })
  async invoke({ id, enabled }: SetAutomationRuleEnabledData): Validated<AutomationRuleDto> {
    const rule = await this.repo.findRule(id);
    if (!rule) return failNotFound(CustomErrorCode.automationRuleNotFound, ["id"]);
    const isOwner = rule.ownerUserId === this.user.id;
    if (enabled && !isOwner) return failAuthorization(CustomErrorCode.automationRuleEditNotOwner, ["id"]);
    if (!enabled && !isOwner && !this.user.role?.isSystemRole)
      return failAuthorization(CustomErrorCode.automationRuleAdminRequired, ["id"]);
    if (enabled && !rule.enabled) {
      const allowance = await this.limits.activeRuleAllowance();
      if (allowance.limit !== null && (await this.repo.countActiveRules(rule.id)) >= allowance.limit)
        return failConflict(CustomErrorCode.automationRuleLimitReached, [], {
          limit: allowance.limit,
          price: allowance.price,
        });
    }
    const updated = await this.repo.setEnabled(id, enabled, enabled ? null : "disabledByUser");
    if (!updated) return failNotFound(CustomErrorCode.automationRuleNotFound, ["id"]);
    return { ok: true as const, data: toAutomationRuleDto(updated) };
  }
}
