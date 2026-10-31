import type { AuthService } from "@/features/auth/auth.service";
import type { EventService } from "@/features/event/event.service";
import type { ReleaseOwnerRoutinesInteractor } from "@/ee/routines/release-owner-routines.interactor";
import type { SubscriptionService } from "@/ee/subscription/subscription.service";
import type { CountActiveUsersRepo } from "@/features/user/count-active-users.repo";
import type { AdminUpdateUserSubscriptionRepo } from "@/features/user/upsert/admin-update-user-subscription.repo";
import type { DeleteAccountForBillingService } from "@/ee/messaging/connect/delete-account-for-billing.service";
import type { LeaveWorkspaceChannelsRepo } from "./leave-workspace-channels.repo";
import type { WorkspaceMembershipRepo } from "./workspace-membership.repo";

import * as ErrorReporter from "@/core/observability/server";
import { Status, SubscriptionPlan } from "@/generated/prisma";

import { calculateChanges } from "@/core/utils/calculate-changes";
import { DomainEvent } from "@/features/event/domain-events";
import { nextLastUsedCompanyId } from "./next-last-used-workspace";

export type WorkspaceDeparture = {
  companyId: string;
  member: { id: string; email: string; status: Status };
  loginId: string | null;
};

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
  ) {}

  async announce(member: Pick<WorkspaceDeparture["member"], "id" | "status">): Promise<void> {
    const changes = calculateChanges({ status: member.status }, { status: Status.inactive });
    if (Object.keys(changes).length)
      await this.eventService.publish(DomainEvent.USER_UPDATED, { entityId: member.id, payload: { changes } });
  }

  async complete({ companyId, member, loginId }: WorkspaceDeparture): Promise<void> {
    if (loginId) await this.authService.revokeMembershipCredentials(loginId, companyId);
    await this.disconnectOwnChannels(member.id);
    if (loginId) await this.moveLastUsedWorkspace(loginId, member.email, companyId);

    if (member.status === Status.active) {
      await this.releaseOwnerRoutines.invoke({ companyId, ownerUserId: member.id });
      await this.updateSubscriptionQuantity();
    }
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

    const activeUsersCount = await this.countUsersRepo.countActiveUsers();
    await this.subscriptionService.updateSubscriptionQuantityOrThrow(subscription.lemonSqueezyId, activeUsersCount);
  }
}
