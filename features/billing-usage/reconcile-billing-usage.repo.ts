export abstract class ReconcileBillingUsageRepo {
  abstract findRecordedWorkspacesUnscoped(after: string | null, limit: number): Promise<string[]>;
  abstract reconcileWorkspaceUnscoped(companyId: string): Promise<void>;
}
