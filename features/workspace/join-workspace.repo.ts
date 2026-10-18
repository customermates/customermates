import type { TenantUser } from "@/features/user/user.schema";
import type { RegisterUserData } from "@/features/user/register/register-user.interactor";

export abstract class JoinWorkspaceRepo {
  abstract hasLeftMembershipUnscoped(email: string, companyId: string): Promise<boolean>;
  abstract registerExistingCompany(args: RegisterUserData & { companyId: string }): Promise<TenantUser>;
}
