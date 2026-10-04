import type { TenantUser } from "@/features/user/user.schema";
import type { AdminUpdateUserDetailsData } from "./admin-update-user-details.interactor";

export abstract class AdminUpdateUserDetailsRepo {
  abstract isPlatformOperatorCompanyWide(userId: string): Promise<boolean>;
  abstract findExistingEmailsCompanyWide(emails: Set<string>): Promise<Set<string>>;
  abstract findOrThrowCompanyWide(email: string): Promise<TenantUser>;
  abstract adminUpdateDetailsOrThrow(args: { userId: string } & AdminUpdateUserDetailsData): Promise<void>;
  abstract markAgentCreditActivatedOrThrow(userId: string): Promise<void>;
  abstract clearAgentCreditActivatedOrThrow(userId: string): Promise<void>;
}
