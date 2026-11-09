import type { AppMode } from "@/core/config/environment";
import type { FreePlanMember, FreePlanMemberRepo } from "./free-plan-member.repo";
import type { PlanInviteRepo } from "./plan-invite.repo";
import type { PlanRoutinePauseRepo } from "./plan-routine-pause.repo";
import type { PlanUsageSubscription } from "./plan-usage.repo";

import { Status } from "@/generated/prisma";
import { FREE_PLAN_USAGE_LIMITS } from "@/core/commercial/plan-catalog";

import { isOnFreePlan, isSubscriptionUsable } from "./entitlements";

export type FreePlanSyncResult = { paused: number; resumed: number; routinesPaused: number; routinesResumed: number };

const NOTHING: FreePlanSyncResult = { paused: 0, resumed: 0, routinesPaused: 0, routinesResumed: 0 };

function normalized(email: string): string {
  return email.trim().toLowerCase();
}

export function chooseFreePlanKeepers(
  members: Pick<FreePlanMember, "id" | "email" | "status" | "isAdmin" | "createdAt">[],
  ownerEmails: string[],
  maxMembers: number = FREE_PLAN_USAGE_LIMITS.maxMembers,
): string[] {
  const active = members
    .filter((member) => member.status === Status.active)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (active.length <= maxMembers) return active.map((member) => member.id);
  return rankFreePlanKeepers(active, ownerEmails)
    .slice(0, maxMembers)
    .map((member) => member.id);
}

function rankFreePlanKeepers<T extends Pick<FreePlanMember, "email" | "isAdmin">>(members: T[], ownerEmails: string[]) {
  const owners = ownerEmails.map(normalized);
  const rank = (member: T) => {
    const owner = owners.indexOf(normalized(member.email));
    const ownerRank = owner >= 0 ? owner : owners.length;
    return (member.isAdmin ? 0 : owners.length + 1) + ownerRank;
  };
  return [...members].sort((a, b) => rank(a) - rank(b));
}

export function chooseFreePlanRevival(
  members: Pick<FreePlanMember, "id" | "email" | "status" | "isAdmin" | "createdAt">[],
  ownerEmails: string[],
): string | null {
  if (members.some((member) => member.status === Status.active)) return null;
  const inactive = members
    .filter((member) => member.status === Status.inactive)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return rankFreePlanKeepers(inactive, ownerEmails)[0]?.id ?? null;
}

export function freePlanTransition(subscription: PlanUsageSubscription | null, now: Date): "pause" | "resume" | null {
  if (!subscription) return null;
  if (isOnFreePlan(subscription, now)) return "pause";
  if (isSubscriptionUsable(subscription)) return "resume";
  return null;
}

export class FreePlanPauseService {
  constructor(
    private readonly members: FreePlanMemberRepo,
    private readonly invites: PlanInviteRepo,
    private readonly routines: (companyId: string) => PlanRoutinePauseRepo,
    private readonly appMode: AppMode,
    private readonly seatQuantity: (companyId: string, activeMembers: number) => Promise<void> = () =>
      Promise.resolve(),
  ) {}

  async syncUnscoped(companyId: string, now: Date = new Date()): Promise<FreePlanSyncResult> {
    if (this.appMode !== "cloud") return NOTHING;
    const transition = freePlanTransition(await this.members.findPlanSubscriptionUnscoped(companyId), now);
    if (transition === "pause") return this.pauseUnscoped(companyId, now);
    if (transition === "resume") return this.resumeUnscoped(companyId, now);
    return NOTHING;
  }

  private async pauseUnscoped(companyId: string, now: Date): Promise<FreePlanSyncResult> {
    const [members, ownerEmails] = await Promise.all([
      this.members.listMembersUnscoped(companyId),
      this.members.findOwnerEmailsUnscoped(companyId),
    ]);
    const revival = chooseFreePlanRevival(members, ownerEmails);
    const revived = revival ? await this.members.reviveMemberForPlanUnscoped({ companyId, userId: revival }) : 0;
    const keepers = new Set(chooseFreePlanKeepers(members, ownerEmails));
    const pausing = members
      .filter((member) => member.status === Status.active && !keepers.has(member.id))
      .map((member) => member.id);
    const paused = await this.members.pauseMembersForPlanUnscoped({
      companyId,
      userIds: pausing,
      now,
      noticeSent: false,
    });
    await this.members.endPendingJoinRequestsUnscoped(companyId, now);
    await this.invites.deleteInviteTokensUnscoped(companyId);
    const routinesPaused = await this.routines(companyId).pauseRoutinesForPlanCompanyWide(now);
    return { ...NOTHING, paused, resumed: revived, routinesPaused };
  }

  private async resumeUnscoped(companyId: string, now: Date): Promise<FreePlanSyncResult> {
    const resumed = await this.members.resumeMembersForPlanUnscoped({ companyId });
    if (resumed > 0) await this.seatQuantity(companyId, await this.members.countActiveMembersUnscoped(companyId));
    const routinesResumed = await this.routines(companyId).resumeRoutinesForPlanCompanyWide(now);
    return { ...NOTHING, resumed, routinesResumed };
  }
}
