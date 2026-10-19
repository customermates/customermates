import type { Locale, SubscriptionPlan, SubscriptionStatus, Status, Theme, CountryCode } from "@/generated/prisma";
import type { TenantUser } from "@/features/user/user.schema";

export type WorkspaceMembershipRow = {
  id: string;
  companyId: string;
  status: Status;
  createdAt: Date;
  role: { name: string; isSystemRole: boolean } | null;
  company: {
    name: string | null;
    createdAt: Date;
    subscription: { status: SubscriptionStatus; plan: SubscriptionPlan; trialEndDate: Date | null } | null;
    _count: { users: number };
  };
};

export type MembershipProfile = {
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  country: CountryCode;
  displayLanguage: Locale;
  formattingLocale: Locale;
  theme: Theme;
};

export abstract class WorkspaceMembershipRepo {
  abstract findMembershipUnscoped(email: string, companyId: string): Promise<TenantUser | null>;
  abstract listWorkspaceMembershipsUnscoped(email: string): Promise<WorkspaceMembershipRow[]>;
  abstract findMembershipProfileUnscoped(email: string): Promise<MembershipProfile | null>;
  abstract hasCreatedWorkspaceUnscoped(authUserId: string): Promise<boolean>;
  abstract hasConsumedTrialUnscoped(authUserId: string): Promise<boolean>;
  abstract markTrialConsumedUnscoped(authUserId: string): Promise<void>;
  abstract listCompanyMembersUnscoped(companyId: string): Promise<{ id: string; email: string }[]>;
  abstract detachAuthIdentitiesFromCompanyUnscoped(companyId: string): Promise<number>;
  abstract countCreatedWorkspacesUnscoped(authUserId: string): Promise<number>;
  abstract findLoginIdUnscoped(email: string): Promise<string | null>;
  abstract findAuthUserCompanyIdUnscoped(userId: string): Promise<string | null | undefined>;
  abstract findAuthUserCompanyIdForUpdateUnscoped(userId: string): Promise<string | null | undefined>;
  abstract setLastUsedCompanyUnscoped(authUserId: string, companyId: string | null): Promise<void>;
  abstract markMembershipActiveUnscoped(email: string, companyId: string): Promise<void>;
  abstract withdrawPendingMembershipUnscoped(email: string, companyId: string): Promise<boolean>;
}
