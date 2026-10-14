import type { TenantUser } from "./user.schema";

export type AuthUserAccountState = {
  companyId: string | null;
  emailVerified: boolean;
};

export abstract class FindUserRepo {
  abstract findAuthUserCompanyIdUnscoped(userId: string): Promise<string | null | undefined>;
  abstract findAuthUserAccountStateUnscoped(userId: string): Promise<AuthUserAccountState | undefined>;
  abstract findCurrentUserUnscoped(email: string): Promise<TenantUser | null>;
  abstract findCurrentUserOrThrowUnscoped(email: string): Promise<TenantUser>;
  abstract findUserByIdOrThrowUnscoped(userId: string): Promise<TenantUser>;
}
