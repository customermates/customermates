import type { Validated } from "@/core/validation/validation.utils";
import type { AutomationRuleRepo } from "./automation-rule.repo";
import type { AutomationRuleRunPage, GetAutomationRuleRunsData } from "./automation-rule.schema";

import { Resource } from "@/generated/prisma";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { roleReadScope } from "@/core/base/permission.service";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

import { toAutomationRuleRunDto } from "./automation-rule-dto";
import { AutomationRuleRunPageSchema, GetAutomationRuleRunsSchema } from "./automation-rule.schema";

@AllowInDemoMode
@TenantInteractor({ resource: Resource.routines, read: true })
export class GetAutomationRuleRunsInteractor extends AuthenticatedInteractor<
  GetAutomationRuleRunsData,
  AutomationRuleRunPage
> {
  constructor(private readonly repo: AutomationRuleRepo) {
    super();
  }

  @Validate(GetAutomationRuleRunsSchema)
  @ValidateOutput(AutomationRuleRunPageSchema)
  async invoke(data: GetAutomationRuleRunsData): Validated<AutomationRuleRunPage> {
    const rule = await this.repo.findRule(data.id);
    const visible =
      rule && (roleReadScope(this.user.role, Resource.routines) === "all" || rule.ownerUserId === this.user.id);
    if (!rule || !visible) return failNotFound(CustomErrorCode.automationRuleNotFound, ["id"]);
    const { items, total } = await this.repo.findRuns({ ruleId: data.id, page: data.page, pageSize: data.pageSize });
    return { ok: true as const, data: { items: items.map(toAutomationRuleRunDto), total } };
  }
}
