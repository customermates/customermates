import type { TenantUser } from "@/features/user/user.schema";
import type { AdminUpdateUserDetailsData } from "./admin-update-user-details.interactor";

export abstract class AdminUpdateUserDetailsRepo {
  abstract isPlatformOperatorCompanyWide(userId: string): Promise<boolean>;
  abstract findMemberCompanyWide(reference: { id: string } | { email: string }): Promise<TenantUser | null>;
  abstract adminUpdateDetailsOrThrow(args: { userId: string } & AdminUpdateUserDetailsData): Promise<void>;
  abstract markAgentCreditActivatedOrThrow(userId: string): Promise<void>;
  abstract clearAgentCreditActivatedOrThrow(userId: string): Promise<void>;
}
