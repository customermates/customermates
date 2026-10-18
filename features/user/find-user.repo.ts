import type { TenantUser } from "./user.schema";
import type { Status } from "@/generated/prisma";

export type AuthUserAccountState = {
  companyId: string | null;
  emailVerified: boolean;
};

export type MembershipSummary = {
  companyId: string;
  status: Status;
};

export abstract class FindUserRepo {
  abstract findAuthUserCompanyIdUnscoped(userId: string): Promise<string | null | undefined>;
  abstract findAuthUserAccountStateUnscoped(userId: string): Promise<AuthUserAccountState | undefined>;
  abstract findMembershipUnscoped(email: string, companyId: string): Promise<TenantUser | null>;
  abstract listMembershipsUnscoped(email: string): Promise<MembershipSummary[]>;
  abstract hasLeftMembershipUnscoped(email: string, companyId: string): Promise<boolean>;
  abstract findUserByIdOrThrowUnscoped(userId: string): Promise<TenantUser>;
}
