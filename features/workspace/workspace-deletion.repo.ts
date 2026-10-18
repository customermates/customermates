import type { WorkspaceDeletionSubject } from "./workspace-deletion-refusal";

export abstract class WorkspaceDeletionRepo {
  abstract findDeletionSubjectUnscoped(companyId: string): Promise<WorkspaceDeletionSubject | null>;
  abstract deleteInviteTokensByCreatorsUnscoped(creatorIds: string[]): Promise<void>;
  abstract deleteWorkflowRunsUnscoped(companyId: string): Promise<number>;
  abstract deleteCompanyUnscoped(companyId: string): Promise<void>;
  abstract markDeletingUnscoped(companyId: string, at: Date): Promise<void>;
  abstract clearDeletingUnscoped(companyId: string, at: Date): Promise<void>;
}
