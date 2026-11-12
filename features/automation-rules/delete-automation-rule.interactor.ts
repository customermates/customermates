import { z } from "zod";

import type { Validated } from "@/core/validation/validation.utils";
import type { AutomationRuleRepo } from "./automation-rule.repo";
import type { AutomationRuleIdData } from "./automation-rule.schema";

import { Resource } from "@/generated/prisma";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { failAuthorization, failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

import { AutomationRuleIdSchema } from "./automation-rule.schema";

const DeletedSchema = z.object({ deleted: z.literal(true), id: z.uuid() });
type Deleted = z.infer<typeof DeletedSchema>;

@TenantInteractor({ resource: Resource.routines, manage: "delete" })
export class DeleteAutomationRuleInteractor extends AuthenticatedInteractor<AutomationRuleIdData, Deleted> {
  constructor(private readonly repo: AutomationRuleRepo) {
    super();
  }

  @Write({ input: AutomationRuleIdSchema, output: DeletedSchema })
  async invoke({ id }: AutomationRuleIdData): Validated<Deleted> {
    const rule = await this.repo.findRule(id);
    if (!rule) return failNotFound(CustomErrorCode.automationRuleNotFound, ["id"]);
    if (rule.ownerUserId !== this.user.id && !this.user.role?.isSystemRole)
      return failAuthorization(CustomErrorCode.automationRuleAdminRequired, ["id"]);
    if (!(await this.repo.deleteRule(id))) return failNotFound(CustomErrorCode.automationRuleNotFound, ["id"]);
    return { ok: true as const, data: { deleted: true as const, id } };
  }
}
