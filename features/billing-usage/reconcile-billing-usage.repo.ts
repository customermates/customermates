export abstract class ReconcileBillingUsageRepo {
  abstract listCompanyIdsUnscoped(): Promise<string[]>;
  abstract listRecordedWorkspacesWithoutCompanyUnscoped(): Promise<string[]>;
  abstract reconcileCompanyUnscoped(companyId: string): Promise<void>;
  abstract closeMissingWorkspaceUnscoped(companyId: string): Promise<void>;
}
