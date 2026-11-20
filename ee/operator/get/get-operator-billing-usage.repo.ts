import type { BillingUsageIntervalRow, BillingUsageWorkspaceRow } from "../billing-usage";
import type { WorkspaceMeasurementRow } from "../workspace-measurement";

export type BillingUsageLedger = {
  workspaces: BillingUsageWorkspaceRow[];
  intervals: Array<BillingUsageIntervalRow & { companyId: string }>;
  recordingStartedAt: Date | null;
};

export abstract class GetOperatorBillingUsageRepo {
  abstract readBillingUsageLedgerUnscoped(args: {
    companyId?: string;
    from: Date;
    before: Date;
  }): Promise<BillingUsageLedger>;
  abstract readWorkspaceMeasurementsUnscoped(
    workspaces: ReadonlyArray<{ companyId: string; createdAt: Date }>,
  ): Promise<Map<string, WorkspaceMeasurementRow>>;
}
