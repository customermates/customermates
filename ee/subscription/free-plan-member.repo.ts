import type { Locale, Status } from "@/generated/prisma";
import type { PlanUsageSubscription } from "./plan-usage.repo";

export type FreePlanMember = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  status: Status;
  isAdmin: boolean;
  createdAt: Date;
  pausedByPlanAt: Date | null;
};

export type PlanPauseNoticeRecipient = {
  id: string;
  companyId: string;
  email: string;
  firstName: string;
  displayLanguage: Locale;
  workspaceName: string | null;
};

export abstract class FreePlanMemberRepo {
  abstract findWorkspacesOverFreePlanUnscoped(now: Date, maxMembers: number): Promise<string[]>;
  abstract findWorkspacesWithPlanPausesUnscoped(now: Date): Promise<string[]>;
  abstract findPlanSubscriptionUnscoped(companyId: string): Promise<PlanUsageSubscription | null>;
  abstract findOwnerEmailsUnscoped(companyId: string): Promise<string[]>;
  abstract listMembersUnscoped(companyId: string): Promise<FreePlanMember[]>;
  abstract pauseMembersForPlanUnscoped(args: {
    companyId: string;
    userIds: string[];
    now: Date;
    noticeSent: boolean;
  }): Promise<number>;
  abstract resumeMembersForPlanUnscoped(args: { companyId: string; userIds?: string[] }): Promise<number>;
  abstract reviveMemberForPlanUnscoped(args: { companyId: string; userId: string }): Promise<number>;
  abstract endPendingJoinRequestsUnscoped(companyId: string, now: Date): Promise<number>;
  abstract findPauseNoticeRecipientsUnscoped(limit: number, companyIds?: string[]): Promise<PlanPauseNoticeRecipient[]>;
  abstract claimPauseNoticeUnscoped(userId: string, now: Date): Promise<boolean>;
  abstract releasePauseNoticeUnscoped(userId: string): Promise<void>;
  abstract findActiveKeeperNameUnscoped(companyId: string): Promise<string | null>;
  abstract countActiveMembersUnscoped(companyId: string): Promise<number>;
  abstract countPlanPausedMembersUnscoped(companyId: string): Promise<number>;
  abstract findMemberPauseUnscoped(userId: string): Promise<{ companyId: string; pausedByPlanAt: Date | null } | null>;
}
