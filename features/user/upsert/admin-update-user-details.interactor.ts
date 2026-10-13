import type { AdminUpdateUserSubscriptionRepo } from "./admin-update-user-subscription.repo";
import type { UpdateUserRoleRepo } from "./update-user-role.repo";
import type { AdminUpdateUserDetailsRepo } from "./admin-update-user-details.repo";
import type { EventService } from "@/features/event/event.service";
import type { ReleaseOwnerRoutinesInteractor } from "@/ee/routines/release-owner-routines.interactor";
import type { Data } from "@/core/validation/validation.utils";
import type { SubscriptionService } from "@/ee/subscription/subscription.service";
import type { CountActiveUsersRepo } from "@/features/user/count-active-users.repo";
import { calculateChanges } from "@/core/utils/calculate-changes";

import { z } from "zod";
import { CountryCode, Status, Resource, SubscriptionPlan } from "@/generated/prisma";

import { DomainEvent } from "@/features/event/domain-events";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { zx, type Validated } from "@/core/validation/validation.utils";
import { Write } from "@/core/decorators/write.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { fail, failAuthorization, failNotFound, unwoundFailure } from "@/core/validation/interactor-failure-server";

export const AdminUpdateUserDetailsSchema = z.object({
  email: z.email(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  country: z.enum(CountryCode),
  status: z.enum([Status.active, Status.inactive]),
  avatarUrl: zx.secureUrl().or(z.literal("")).nullable(),
  roleId: z.uuid(),
});
export type AdminUpdateUserDetailsData = Data<typeof AdminUpdateUserDetailsSchema>;

export const UpdateMemberSchema = AdminUpdateUserDetailsSchema.partial().extend({ userId: z.uuid().optional() });
export type UpdateMemberData = Data<typeof UpdateMemberSchema>;

@TenantInteractor({ resource: Resource.users, manage: "update" })
export class AdminUpdateUserDetailsInteractor extends AuthenticatedInteractor<
  UpdateMemberData,
  AdminUpdateUserDetailsData
> {
  constructor(
    private userRepo: AdminUpdateUserDetailsRepo,
    private roleRepo: UpdateUserRoleRepo,
    private eventService: EventService,
    private subscriptionService: SubscriptionService,
    private subscriptionRepo: AdminUpdateUserSubscriptionRepo,
    private countUsersRepo: CountActiveUsersRepo,
    private releaseOwnerRoutines: ReleaseOwnerRoutinesInteractor,
  ) {
    super();
  }

  @Write({ input: UpdateMemberSchema, output: AdminUpdateUserDetailsSchema })
  async invoke({ userId, email, ...change }: UpdateMemberData): Validated<AdminUpdateUserDetailsData> {
    if (!userId && !email) return fail(CustomErrorCode.memberReferenceRequired, ["userId"]);
    const targetUser = await this.userRepo.findMemberCompanyWide(userId ? { id: userId } : { email: email ?? "" });
    if (!targetUser || (userId && email && targetUser.email !== email))
      return failNotFound(CustomErrorCode.userNotFound, [userId ? "userId" : "email"]);
    const targetUserId = targetUser.id;

    if (targetUserId === this.userId)
      return failAuthorization(CustomErrorCode.userSelfAdminUpdateForbidden, [userId ? "userId" : "email"]);

    const roleId = change.roleId ?? targetUser.roleId;
    if (!roleId) return fail(CustomErrorCode.userRoleRequired, ["roleId"]);
    const role = roleId === targetUser.roleId ? targetUser.role : await this.roleRepo.findRoleById(roleId);
    if (!role) return failNotFound(CustomErrorCode.roleNotFound, ["roleId"]);

    const next = {
      email: targetUser.email,
      firstName: change.firstName ?? targetUser.firstName,
      lastName: change.lastName ?? targetUser.lastName,
      country: change.country ?? targetUser.country,
      avatarUrl: change.avatarUrl === undefined ? targetUser.avatarUrl : change.avatarUrl,
      roleId,
      status: change.status ?? targetUser.status,
    };
    if (next.status === Status.pendingAuthorization) return fail(CustomErrorCode.userStatusRequired, ["status"]);
    const data: AdminUpdateUserDetailsData = { ...next, status: next.status };

    const leavingActive = targetUser.status === Status.active && data.status !== Status.active;
    if (leavingActive && (await this.userRepo.isPlatformOperatorCompanyWide(targetUserId)))
      return failAuthorization(CustomErrorCode.userPlatformOperatorStatusForbidden, ["status"]);

    const targetIsSystem = targetUser.role?.isSystemRole ?? false;
    const newRoleIsSystemAndActive = role.isSystemRole && data.status === Status.active;
    if (
      targetIsSystem &&
      !newRoleIsSystemAndActive &&
      !(await this.roleRepo.hasAnotherActiveSystemRoleUser(targetUserId))
    )
      return fail(CustomErrorCode.roleSystemRequired, ["roleId"]);

    await this.userRepo.adminUpdateDetailsOrThrow({
      userId: targetUserId,
      ...data,
    });

    const statusChanged = targetUser.status !== data.status;

    if (statusChanged) {
      if (data.status === Status.active) await this.userRepo.markAgentCreditActivatedOrThrow(targetUserId);
      else await this.userRepo.clearAgentCreditActivatedOrThrow(targetUserId);

      await this.handleSubscriptionQuantityUpdate();
    }

    if (leavingActive)
      await this.releaseOwnerRoutines.invoke({ companyId: this.user.companyId, ownerUserId: targetUserId });

    const changes = calculateChanges(
      {
        firstName: targetUser.firstName,
        lastName: targetUser.lastName,
        country: targetUser.country,
        status: targetUser.status,
        role: targetUser.role?.name ?? null,
      },
      {
        firstName: data.firstName,
        lastName: data.lastName,
        country: data.country,
        status: data.status,
        role: role.name,
      },
    );
    try {
      if (Object.keys(changes).length)
        await this.eventService.publish(DomainEvent.USER_UPDATED, { entityId: targetUserId, payload: { changes } });
    } catch (error) {
      return unwoundFailure(error);
    }

    return { ok: true as const, data };
  }

  private async handleSubscriptionQuantityUpdate(): Promise<void> {
    const subscription = await this.subscriptionRepo.getSubscriptionOrThrow();

    if (subscription.plan === SubscriptionPlan.enterprise) return;
    if (!subscription.lemonSqueezyId) return;

    const activeUsersCount = await this.countUsersRepo.countActiveUsers();

    await this.subscriptionService.updateSubscriptionQuantityOrThrow(subscription.lemonSqueezyId, activeUsersCount);
  }
}
