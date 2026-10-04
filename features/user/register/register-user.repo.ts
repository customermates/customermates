import type { TenantUser } from "@/features/user/user.service";
import { type RegistrationAdAttribution } from "@/features/acquisition/ad-attribution.schema";
import type { RegisterUserData } from "./register-user.interactor";

export abstract class RegisterUserRepo {
  abstract findAuthUserCompanyIdUnscoped(userId: string): Promise<string | null | undefined>;
  abstract findAuthUserCompanyIdForUpdateUnscoped(userId: string): Promise<string | null | undefined>;
  abstract findCurrentUserUnscoped(email: string): Promise<TenantUser | null>;
  abstract bindAuthUserToCompanyOrThrowUnscoped(args: { authUserId: string; companyId: string }): Promise<void>;
  abstract createCompanyAndUser(
    args: RegisterUserData & {
      adAttribution?: RegistrationAdAttribution[];
    },
  ): Promise<TenantUser>;
  abstract registerExistingCompany(args: RegisterUserData & { companyId: string }): Promise<TenantUser>;
}
