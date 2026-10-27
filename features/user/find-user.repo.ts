import type { TenantUser } from "./user.schema";
import type { Status } from "@/generated/prisma";

type AuthUserAccountState = {
  companyId: string | null;
  emailVerified: boolean;
};

type MembershipSummary = {
  companyId: string;
  status: Status;
};

export abstract class FindUserRepo {
  abstract findAuthUserCompanyIdUnscoped(userId: string): Promise<string | null | undefined>;
  abstract findAuthUserAccountStateUnscoped(userId: string): Promise<AuthUserAccountState | undefined>;
  abstract findMembershipUnscoped(email: string, companyId: string): Promise<TenantUser | null>;
  abstract findMembershipBySlugUnscoped(email: string, slug: string): Promise<TenantUser | null>;
  abstract setLastUsedCompanyUnscoped(authUserId: string, companyId: string | null): Promise<void>;
  abstract listMembershipsUnscoped(email: string): Promise<MembershipSummary[]>;
  abstract hasLeftMembershipUnscoped(email: string, companyId: string): Promise<boolean>;
  abstract findUserByIdOrThrowUnscoped(userId: string): Promise<TenantUser>;
  abstract touchLastActiveUnscoped(
    member: Pick<TenantUser, "id" | "companyId" | "updatedAt">,
    staleBefore: Date,
  ): Promise<void>;
}
