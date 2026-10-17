import type { TenantUser } from "@/features/user/user.service";
import { type RegistrationAdAttribution } from "@/features/acquisition/ad-attribution.schema";
import type { RegisterUserData } from "./register-user.interactor";
import type { Locale, Theme } from "@/generated/prisma";

export type OwnerPreferences = {
  displayLanguage: Locale;
  formattingLocale: Locale;
  theme: Theme;
};

export abstract class RegisterUserRepo {
  abstract findAuthUserCompanyIdUnscoped(userId: string): Promise<string | null | undefined>;
  abstract findAuthUserCompanyIdForUpdateUnscoped(userId: string): Promise<string | null | undefined>;
  abstract findAnyMembershipUnscoped(email: string): Promise<TenantUser | null>;
  abstract hasCreatedWorkspaceUnscoped(authUserId: string): Promise<boolean>;
  abstract countCreatedWorkspacesUnscoped(authUserId: string): Promise<number>;
  abstract hasLeftMembershipUnscoped(email: string, companyId: string): Promise<boolean>;
  abstract bindAuthUserToCompanyOrThrowUnscoped(args: { authUserId: string; companyId: string }): Promise<void>;
  abstract createCompanyOwnerOrThrow(
    args: RegisterUserData & {
      companyId: string;
      roleId: string;
      adAttribution?: RegistrationAdAttribution[];
      preferences?: OwnerPreferences;
    },
  ): Promise<{ user: TenantUser; createdAt: Date }>;
  abstract registerExistingCompany(args: RegisterUserData & { companyId: string }): Promise<TenantUser>;
}
