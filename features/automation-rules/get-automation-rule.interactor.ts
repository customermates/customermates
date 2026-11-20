import type { Validated } from "@/core/validation/validation.utils";
import type { AutomationRuleRepo } from "./automation-rule.repo";
import type { AutomationRuleDto, AutomationRuleIdData } from "./automation-rule.schema";

import { Resource } from "@/generated/prisma";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { roleReadScope } from "@/core/base/permission.service";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

import { toAutomationRuleDto } from "./automation-rule-dto";
import { AutomationRuleDtoSchema, AutomationRuleIdSchema } from "./automation-rule.schema";

@AllowInDemoMode
@TenantInteractor({ resource: Resource.routines, read: true })
export class GetAutomationRuleInteractor extends AuthenticatedInteractor<AutomationRuleIdData, AutomationRuleDto> {
  constructor(private readonly repo: AutomationRuleRepo) {
    super();
  }

  @Validate(AutomationRuleIdSchema)
  @ValidateOutput(AutomationRuleDtoSchema)
  async invoke({ id }: AutomationRuleIdData): Validated<AutomationRuleDto> {
    const rule = await this.repo.findRule(id);
    const visible =
      rule && (roleReadScope(this.user.role, Resource.routines) === "all" || rule.ownerUserId === this.user.id);
    if (!rule || !visible) return failNotFound(CustomErrorCode.automationRuleNotFound, ["id"]);
    return { ok: true as const, data: toAutomationRuleDto(rule) };
  }
}
