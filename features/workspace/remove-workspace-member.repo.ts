import type { TenantUser } from "@/features/user/user.schema";

export type WorkspaceMemberReference = { id: string } | { email: string };

export type RemovableWorkspaceMember = TenantUser & { leftAt: Date | null };

export abstract class RemoveWorkspaceMemberRepo {
  abstract findMemberCompanyWide(reference: WorkspaceMemberReference): Promise<RemovableWorkspaceMember | null>;
  abstract isPlatformOperatorCompanyWide(userId: string): Promise<boolean>;
  abstract leaveCompanyWide(userId: string): Promise<boolean>;
}
