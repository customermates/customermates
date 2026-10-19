export abstract class ReconcileBillingUsageRepo {
  abstract findWorkspacesToReconcileUnscoped(after: string | null, limit: number): Promise<string[]>;
  abstract reconcileWorkspaceUnscoped(companyId: string): Promise<void>;
}
