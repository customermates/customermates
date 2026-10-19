import type { RemovableWorkspaceMember, WorkspaceMemberReference } from "./remove-workspace-member.repo";

export abstract class LeaveWorkspaceRepo {
  abstract findMemberCompanyWide(reference: WorkspaceMemberReference): Promise<RemovableWorkspaceMember | null>;
  abstract strandsLastPlatformOperatorCompanyWide(userId: string): Promise<boolean>;
  abstract leaveCompanyWide(userId: string): Promise<boolean>;
}
