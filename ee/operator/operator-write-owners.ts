import type { Status, Subscription } from "@/generated/prisma";

export type OperatorWriteOwners = {
  users: {
    setOperatorStatusCompanyWide(
      companyId: string,
      userId: string,
      status: Status,
      agentCreditActivatedAt?: Date | null,
    ): Promise<void>;
    setPlatformOperatorCompanyWide(companyId: string, userId: string, isPlatformOperator: boolean): Promise<void>;
    deleteAuthIdentitiesUnscoped(identityIds: string[]): Promise<void>;
    detachAuthIdentitiesFromCompanyUnscoped(companyId: string): Promise<number>;
  };
  records: {
    deleteMembershipAuthorizationTasksCompanyWide(companyId: string, relatedUserId: string): Promise<void>;
  };
  companies: {
    correctSubscriptionSnapshotUnscoped(
      companyId: string,
      next: Pick<Subscription, "plan" | "status" | "quantity">,
    ): Promise<void>;
    setEnterpriseAgentCreditsUnscoped(companyId: string, creditsPerUser: number | null): Promise<void>;
    setSubscriptionTermsUnscoped(
      companyId: string,
      terms: { trialEndDate: Date | null; lemonSqueezyId: string | null },
    ): Promise<void>;
    setWorkspaceTagsUnscoped(companyId: string, tags: string[]): Promise<void>;
    deleteInviteTokensByCreatorsUnscoped(creatorIds: string[]): Promise<void>;
    deleteCompanyUnscoped(companyId: string): Promise<void>;
  };
  identities: {
    deleteVerificationsForEmails(emails: string[]): Promise<void>;
    deleteApiKeysForIdentities(identityIds: string[]): Promise<void>;
  };
  inboundEvents: {
    deleteCompanyInboundEventsUnscoped(companyId: string): Promise<void>;
  };
};
