import type { BillingUsageIntervalRow, BillingUsageWorkspaceRow } from "../billing-usage";

export type BillingUsageLedger = {
  workspaces: BillingUsageWorkspaceRow[];
  intervals: Array<BillingUsageIntervalRow & { companyId: string }>;
};

export abstract class GetOperatorBillingUsageRepo {
  abstract readBillingUsageLedgerUnscoped(args: {
    companyId?: string;
    from: Date;
    before: Date;
  }): Promise<BillingUsageLedger>;
}
