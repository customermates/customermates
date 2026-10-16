import type { BillingUsageLedger, GetOperatorBillingUsageRepo } from "./get-operator-billing-usage.repo";
import type { GetOperatorBillingUsageData, OperatorBillingUsageDto } from "../billing-usage.schema";
import type { Validated } from "@/core/validation/validation.utils";

import { failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { OperatorReadInteractor } from "@/core/decorators/operator-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { billingUsageWindow, workspaceBillingUsage, workspaceExistsIn } from "../billing-usage";
import { operatorCollator } from "../operator-list-filters";
import { GetOperatorBillingUsageSchema, OperatorBillingUsageDtoSchema } from "../billing-usage.schema";

@OperatorReadInteractor
export class GetOperatorBillingUsageInteractor {
  constructor(private readonly repo: GetOperatorBillingUsageRepo) {}

  @Validate(GetOperatorBillingUsageSchema)
  @ValidateOutput(OperatorBillingUsageDtoSchema)
  async invoke(data: GetOperatorBillingUsageData): Validated<OperatorBillingUsageDto> {
    const window = billingUsageWindow(data.month);
    const ledger = await this.repo.readBillingUsageLedgerUnscoped({
      companyId: data.companyId,
      from: window.from,
      before: window.to,
    });

    if (data.companyId && !ledger.workspaces.some((workspace) => workspace.companyId === data.companyId))
      return failNotFound(CustomErrorCode.userNotFound);

    const intervalsByCompany = new Map<string, BillingUsageLedger["intervals"]>();
    for (const interval of ledger.intervals) {
      const companyIntervals = intervalsByCompany.get(interval.companyId) ?? [];
      companyIntervals.push(interval);
      intervalsByCompany.set(interval.companyId, companyIntervals);
    }

    const collator = operatorCollator();
    const workspaces = ledger.workspaces
      .filter((workspace) =>
        data.companyId ? workspace.companyId === data.companyId : workspaceExistsIn(workspace, window),
      )
      .map((workspace) =>
        workspaceBillingUsage({
          workspace,
          intervals: intervalsByCompany.get(workspace.companyId) ?? [],
          window,
          includeDetails: Boolean(data.companyId),
        }),
      )
      .sort(
        (a, b) =>
          b.seats.count - a.seats.count ||
          b.channels.peak - a.channels.peak ||
          collator.compare(a.workspaceLabel, b.workspaceLabel) ||
          collator.compare(a.companyId, b.companyId),
      );

    return {
      ok: true,
      data: {
        month: window.month,
        from: window.from,
        to: window.to,
        monthComplete: window.to.getTime() <= Date.now(),
        workspaces,
      },
    };
  }
}
