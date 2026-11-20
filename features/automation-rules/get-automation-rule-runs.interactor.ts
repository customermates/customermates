import type { Validated } from "@/core/validation/validation.utils";
import type { AutomationRunRecordReader } from "./automation-ports";
import type { AutomationRuleRepo } from "./automation-rule.repo";
import type { AutomationRuleRunPage, GetAutomationRuleRunsData } from "./automation-rule.schema";

import { Resource } from "@/generated/prisma";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { roleReadScope } from "@/core/base/permission.service";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { fail, failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

import { decodeAutomationRunCursor, encodeAutomationRunCursor } from "./automation-run-cursor";
import { toAutomationRuleRunDto } from "./automation-rule-dto";
import {
  AUTOMATION_RUN_PAGE_SIZE,
  AutomationRuleRunPageSchema,
  GetAutomationRuleRunsSchema,
} from "./automation-rule.schema";

@AllowInDemoMode
@TenantInteractor({ resource: Resource.routines, read: true })
export class GetAutomationRuleRunsInteractor extends AuthenticatedInteractor<
  GetAutomationRuleRunsData,
  AutomationRuleRunPage
> {
  constructor(
    private readonly repo: AutomationRuleRepo,
    private readonly records: AutomationRunRecordReader,
  ) {
    super();
  }

  @Validate(GetAutomationRuleRunsSchema)
  @ValidateOutput(AutomationRuleRunPageSchema)
  async invoke(data: GetAutomationRuleRunsData): Validated<AutomationRuleRunPage> {
    const rule = await this.repo.findRule(data.id);
    const visible =
      rule && (roleReadScope(this.user.role, Resource.routines) === "all" || rule.ownerUserId === this.user.id);
    if (!rule || !visible) return failNotFound(CustomErrorCode.automationRuleNotFound, ["id"]);
    const decoded = decodeAutomationRunCursor(data.cursor);
    if (!decoded.valid) return fail(CustomErrorCode.automationRuleRunCursorInvalid, ["cursor"]);
    const rows = await this.repo.findRuns({
      ruleId: data.id,
      cursor: decoded.cursor,
      limit: AUTOMATION_RUN_PAGE_SIZE + 1,
    });
    const page = rows.slice(0, AUTOMATION_RUN_PAGE_SIZE);
    const last = page.at(-1);
    const readable = await this.records.readableRecordIds({
      companyId: this.user.companyId,
      userId: this.user.id,
      refs: page.flatMap((run) => (run.typeId && run.recordId ? [{ typeId: run.typeId, recordId: run.recordId }] : [])),
    });
    return {
      ok: true as const,
      data: {
        runs: page.map((run) => toAutomationRuleRunDto(run, run.recordId !== null && readable.has(run.recordId))),
        nextCursor:
          rows.length > AUTOMATION_RUN_PAGE_SIZE && last
            ? encodeAutomationRunCursor({ createdAt: last.createdAt, id: last.id })
            : null,
      },
    };
  }
}
