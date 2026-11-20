import type { AgentRunnerRevocation } from "@/features/agent-runners/agent-runner-revocation";
import type { AuthService } from "@/features/auth/auth.service";
import type { AutomationRuleRepo } from "@/features/automation-rules/automation-rule.repo";
import type { EventService } from "@/features/event/event.service";
import type { ReleaseOwnerRoutinesInteractor } from "@/ee/routines/release-owner-routines.interactor";
import type { SubscriptionService } from "@/ee/subscription/subscription.service";
import type { CountActiveUsersRepo } from "@/features/user/count-active-users.repo";
import type { AdminUpdateUserSubscriptionRepo } from "@/features/user/upsert/admin-update-user-subscription.repo";
import type { DeleteAccountForBillingService } from "@/ee/messaging/connect/delete-account-for-billing.service";
import type { HandOverPublicEndpointsService } from "./hand-over-public-endpoints.service";
import type { LeaveWorkspaceChannelsRepo } from "./leave-workspace-channels.repo";
import type { WorkspaceMembershipRepo } from "./workspace-membership.repo";

import * as ErrorReporter from "@/core/observability/server";
import { Status, SubscriptionPlan } from "@/generated/prisma";
import { isOnFreePlan } from "@/ee/subscription/entitlements";

import { calculateChanges } from "@/core/utils/calculate-changes";
import { DomainEvent } from "@/features/event/domain-events";
import { nextLastUsedCompanyId } from "./next-last-used-workspace";

export type WorkspaceDeparture = {
  companyId: string;
  member: { id: string; email: string; status: Status };
  loginId: string | null;
  successorUserId?: string;
};

export type WorkspaceDepartureKind = "left" | "removed";

export const WORKSPACE_DEPARTURE_FIELDS = {
  left: "leftAt",
  removed: "removedAt",
} as const satisfies Record<WorkspaceDepartureKind, string>;

export class WorkspaceDepartureService {
  constructor(
    private readonly authService: AuthService,
    private readonly memberships: WorkspaceMembershipRepo,
    private readonly eventService: EventService,
    private readonly subscriptionService: SubscriptionService,
    private readonly subscriptionRepo: AdminUpdateUserSubscriptionRepo,
    private readonly countUsersRepo: CountActiveUsersRepo,
    private readonly releaseOwnerRoutines: ReleaseOwnerRoutinesInteractor,
    private readonly channels: LeaveWorkspaceChannelsRepo,
    private readonly channelRemoval: Pick<DeleteAccountForBillingService, "deleteForBillingOrThrow">,
    private readonly handOverEndpoints: Pick<HandOverPublicEndpointsService, "invoke">,
    private readonly runners: Pick<AgentRunnerRevocation, "revokeOfMember">,
    private readonly rules: Pick<AutomationRuleRepo, "releasePlanPausedOwnerRulesUnscoped">,
  ) {}

  async announce(
    member: Pick<WorkspaceDeparture["member"], "id" | "status">,
    kind: WorkspaceDepartureKind,
    at: Date = new Date(),
  ): Promise<void> {
    const departure =
      member.status === Status.pendingAuthorization
        ? {}
        : { [WORKSPACE_DEPARTURE_FIELDS[kind]]: { previous: null, current: at.toISOString() } };
    const changes = { ...departure, ...calculateChanges({ status: member.status }, { status: Status.inactive }) };
    if (Object.keys(changes).length)
      await this.eventService.publish(DomainEvent.USER_UPDATED, { entityId: member.id, payload: { changes } });
  }

  async complete({ companyId, member, loginId, successorUserId }: WorkspaceDeparture): Promise<void> {
    if (loginId) await this.authService.revokeMembershipCredentials(loginId, companyId);
    await this.runners.revokeOfMember({ companyId, userId: member.id, at: new Date() });
    await this.disconnectOwnChannels(member.id);
    if (loginId) await this.moveLastUsedWorkspace(loginId, member.email, companyId);

    if (member.status !== Status.pendingAuthorization)
      await this.handOverPublicEndpoints(companyId, member.id, successorUserId);
    if (member.status === Status.active) {
      await this.releaseOwnerRoutines.invoke({ companyId, ownerUserId: member.id });
      await this.updateSubscriptionQuantity();
    }
    await this.rules.releasePlanPausedOwnerRulesUnscoped(companyId, member.id);
  }

  private async handOverPublicEndpoints(companyId: string, leaverId: string, preferredId?: string): Promise<void> {
    const admins = (await this.memberships.listActiveAdminIdsUnscoped(companyId)).filter((id) => id !== leaverId);
    const successor = preferredId && admins.includes(preferredId) ? preferredId : admins[0];
    if (!successor) return;
    await this.handOverEndpoints.invoke({ companyId, fromUserIds: [leaverId], toUserId: successor });
  }

  private async moveLastUsedWorkspace(loginId: string, email: string, companyId: string): Promise<void> {
    if ((await this.memberships.findAuthUserCompanyIdUnscoped(loginId)) !== companyId) return;

    const memberships = await this.memberships.listWorkspaceMembershipsUnscoped(email);
    await this.memberships.setLastUsedCompanyUnscoped(loginId, nextLastUsedCompanyId(memberships, companyId));
  }

  private async disconnectOwnChannels(userId: string): Promise<void> {
    for (const accountId of await this.channels.findOwnedConnectedAccountIdsCompanyWide(userId)) {
      try {
        await this.channelRemoval.deleteForBillingOrThrow(accountId, "ownerInactive");
      } catch (error) {
        ErrorReporter.captureException(error, { tags: { kind: "workspace-departure-channel" } });
      }
    }
  }

  private async updateSubscriptionQuantity(): Promise<void> {
    const subscription = await this.subscriptionRepo.getSubscriptionOrThrow();
    if (subscription.plan === SubscriptionPlan.enterprise || !subscription.lemonSqueezyId) return;
    if (isOnFreePlan(subscription)) return;

    const activeUsersCount = await this.countUsersRepo.countActiveUsers();
    await this.subscriptionService.updateSubscriptionQuantityOrThrow(subscription.lemonSqueezyId, activeUsersCount);
  }
}
