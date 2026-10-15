import type { Validated } from "@/core/validation/validation.utils";
import type { AuthService } from "@/features/auth/auth.service";
import type { EventService } from "@/features/event/event.service";
import type { ReleaseOwnerRoutinesInteractor } from "@/ee/routines/release-owner-routines.interactor";
import type { SubscriptionService } from "@/ee/subscription/subscription.service";
import type { CountActiveUsersRepo } from "@/features/user/count-active-users.repo";
import type { AdminUpdateUserSubscriptionRepo } from "@/features/user/upsert/admin-update-user-subscription.repo";
import type { UpdateUserRoleRepo } from "@/features/user/upsert/update-user-role.repo";
import type { DeleteAccountForBillingService } from "@/ee/messaging/connect/delete-account-for-billing.service";
import type { LeaveWorkspaceChannelsRepo } from "./leave-workspace-channels.repo";
import type { LeaveWorkspaceRepo } from "./leave-workspace.repo";
import type { WorkspaceMembershipRepo } from "./workspace-membership.repo";

import * as Sentry from "@sentry/nextjs";
import { z } from "zod";
import { Status, SubscriptionPlan } from "@/generated/prisma";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { calculateChanges } from "@/core/utils/calculate-changes";
import { fail, failAuthorization } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { DomainEvent } from "@/features/event/domain-events";
import { nextLastUsedCompanyId } from "./next-last-used-workspace";

const OutputSchema = z.object({ companyId: z.string() });
type LeaveWorkspaceResult = z.infer<typeof OutputSchema>;

@TenantInteractor()
export class LeaveWorkspaceInteractor extends AuthenticatedInteractor<void, LeaveWorkspaceResult> {
  constructor(
    private readonly authService: AuthService,
    private readonly repo: LeaveWorkspaceRepo,
    private readonly roleRepo: UpdateUserRoleRepo,
    private readonly memberships: WorkspaceMembershipRepo,
    private readonly eventService: EventService,
    private readonly subscriptionService: SubscriptionService,
    private readonly subscriptionRepo: AdminUpdateUserSubscriptionRepo,
    private readonly countUsersRepo: CountActiveUsersRepo,
    private readonly releaseOwnerRoutines: ReleaseOwnerRoutinesInteractor,
    private readonly channels: LeaveWorkspaceChannelsRepo,
    private readonly channelRemoval: Pick<DeleteAccountForBillingService, "deleteForBillingOrThrow">,
  ) {
    super();
  }

  @ValidateOutput(OutputSchema)
  async invoke(): Validated<LeaveWorkspaceResult> {
    const session = await this.authService.getInteractiveSession();
    if (!session || session.user.email !== this.user.email) return failAuthorization(CustomErrorCode.permissionDenied);

    const { companyId, userId } = this;
    const wasActive = this.user.status === Status.active;

    const refusal = await runInTransaction(
      async () => {
        if (await this.repo.isPlatformOperatorCompanyWide(userId))
          return failAuthorization(CustomErrorCode.userPlatformOperatorStatusForbidden);
        if (wasActive && this.user.role?.isSystemRole && !(await this.roleRepo.hasAnotherActiveSystemRoleUser(userId)))
          return fail(CustomErrorCode.workspaceLastAdmin);

        await this.repo.leaveCompanyWide(userId);
        return null;
      },
      { companyId },
    );
    if (refusal) return refusal;

    await this.authService.revokeMembershipCredentials(session.user.id, companyId);
    await this.disconnectOwnChannels(userId);
    if ((await this.memberships.findAuthUserCompanyIdUnscoped(session.user.id)) === companyId) {
      const memberships = await this.memberships.listWorkspaceMembershipsUnscoped(session.user.email);
      await this.memberships.setLastUsedCompanyUnscoped(session.user.id, nextLastUsedCompanyId(memberships, companyId));
    }

    if (wasActive) {
      await this.releaseOwnerRoutines.invoke({ companyId, ownerUserId: userId });
      await this.updateSubscriptionQuantity();
    }

    const changes = calculateChanges({ status: this.user.status }, { status: Status.inactive });
    if (Object.keys(changes).length)
      await this.eventService.publish(DomainEvent.USER_UPDATED, { entityId: userId, payload: { changes } });

    return { ok: true as const, data: { companyId } };
  }

  private async disconnectOwnChannels(userId: string): Promise<void> {
    for (const accountId of await this.channels.findOwnedConnectedAccountIdsCompanyWide(userId)) {
      try {
        await this.channelRemoval.deleteForBillingOrThrow(accountId, "ownerInactive");
      } catch (error) {
        Sentry.captureException(error, { tags: { kind: "leave-workspace-channel" } });
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
