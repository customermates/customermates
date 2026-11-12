import type { Validated } from "@/core/validation/validation.utils";
import type { AutomationRuleRepo } from "./automation-rule.repo";
import type { AutomationRulePage, GetAutomationRulesData } from "./automation-rule.schema";

import { Resource } from "@/generated/prisma";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { roleReadScope } from "@/core/base/permission.service";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

import { toAutomationRuleDto } from "./automation-rule-dto";
import { AutomationRulePageSchema, GetAutomationRulesSchema } from "./automation-rule.schema";

@AllowInDemoMode
@TenantInteractor({ resource: Resource.routines, read: true })
export class GetAutomationRulesInteractor extends AuthenticatedInteractor<GetAutomationRulesData, AutomationRulePage> {
  constructor(private readonly repo: AutomationRuleRepo) {
    super();
  }

  @Validate(GetAutomationRulesSchema)
  @ValidateOutput(AutomationRulePageSchema)
  async invoke(data: GetAutomationRulesData): Validated<AutomationRulePage> {
    const ownOnly = data.owner === "mine" || roleReadScope(this.user.role, Resource.routines) === "own";
    const { items, total } = await this.repo.findRules({
      typeId: data.typeId,
      ownerUserId: ownOnly ? this.user.id : undefined,
      page: data.page,
      pageSize: data.pageSize,
    });
    return { ok: true as const, data: { items: items.map(toAutomationRuleDto), total } };
  }
}
