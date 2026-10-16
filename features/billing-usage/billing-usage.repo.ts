export type BillingUsageChanges = readonly string[] | "sweep";

export abstract class BillingUsageRepo {
  abstract recordSeats(companyId: string, changed: BillingUsageChanges): Promise<void>;
  abstract recordChannels(companyId: string, changed: BillingUsageChanges): Promise<void>;
  abstract recordWorkspaceCreated(companyId: string): Promise<void>;
  abstract recordWorkspaceDeleted(companyId: string, changed: "deleted" | "sweep"): Promise<void>;
}
