import type { AdminUpdateUserSubscriptionRepo } from "./admin-update-user-subscription.repo";
import type { UpdateUserRoleRepo } from "./update-user-role.repo";
import type { AdminUpdateUserDetailsRepo } from "./admin-update-user-details.repo";
import type { EventService } from "@/features/event/event.service";
import type { ReleaseOwnerRoutinesInteractor } from "@/ee/routines/release-owner-routines.interactor";
import type { Data } from "@/core/validation/validation.utils";
import type { SubscriptionService } from "@/ee/subscription/subscription.service";
import type { CountActiveUsersRepo } from "@/features/user/count-active-users.repo";
import { recordWriteFailure } from "@/features/records/mutate-record.interactor";
import { calculateChanges } from "@/core/utils/calculate-changes";

import { z } from "zod";
import { getTranslations } from "next-intl/server";
import { CountryCode, Status, Resource, SubscriptionPlan } from "@/generated/prisma";

import { DomainEvent } from "@/features/event/domain-events";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { createZodError, zx, type Validated } from "@/core/validation/validation.utils";
import { Write } from "@/core/decorators/write.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { checkIds } from "@/core/validation/validators/check-ids";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { failAuthorization } from "@/core/validation/interactor-failure-server";

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

@TenantInteractor({ resource: Resource.users, manage: "update" })
export class AdminUpdateUserDetailsInteractor extends AuthenticatedInteractor<
  AdminUpdateUserDetailsData,
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

  @Write({
    input: AdminUpdateUserDetailsSchema,
    output: AdminUpdateUserDetailsSchema,
    precheck: (self, data, ctx) => self.precheck(data, ctx),
  })
  async invoke(data: AdminUpdateUserDetailsData): Validated<AdminUpdateUserDetailsData> {
    const targetUser = await this.userRepo.findOrThrowCompanyWide(data.email);
    const targetUserId = targetUser.id;

    if (targetUserId === this.userId) return failAuthorization(CustomErrorCode.userSelfAdminUpdateForbidden, ["email"]);

    const leavingActive = targetUser.status === Status.active && data.status !== Status.active;
    if (leavingActive && (await this.userRepo.isPlatformOperatorCompanyWide(targetUserId)))
      return failAuthorization(CustomErrorCode.userPlatformOperatorStatusForbidden, ["status"]);

    const targetIsSystem = targetUser.roleId ? await this.roleRepo.isSystemRoleOrThrow(targetUser.roleId) : false;
    const newRoleIsSystemAndActive =
      (await this.roleRepo.isSystemRoleOrThrow(data.roleId)) && data.status === Status.active;

    if (targetIsSystem && !newRoleIsSystemAndActive) {
      const hasAnother = await this.roleRepo.hasAnotherActiveSystemRoleUser(targetUserId);

      if (!hasAnother) {
        const t = await getTranslations();
        const error = createZodError<AdminUpdateUserDetailsData>(t("Common.errors.roleSystemRequired"), ["roleId"]);

        return {
          ok: false,
          error,
        };
      }
    }

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

    const previousRole = targetUser.role?.name ?? null;
    const role =
      data.roleId === targetUser.roleId
        ? previousRole
        : ((await this.roleRepo.findRoleById(data.roleId))?.name ?? null);
    const changes = calculateChanges(
      {
        firstName: targetUser.firstName,
        lastName: targetUser.lastName,
        country: targetUser.country,
        status: targetUser.status,
        role: previousRole,
      },
      { firstName: data.firstName, lastName: data.lastName, country: data.country, status: data.status, role },
    );
    try {
      if (Object.keys(changes).length)
        await this.eventService.publish(DomainEvent.USER_UPDATED, { entityId: targetUserId, payload: { changes } });
    } catch (error) {
      return recordWriteFailure(error);
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

  private async precheck(data: AdminUpdateUserDetailsData, ctx: z.RefinementCtx) {
    await checkIds(
      [{ ids: data.email, path: ["email"] }],
      ctx,
      (emails) => this.userRepo.findExistingEmailsCompanyWide(emails),
      CustomErrorCode.userNotFound,
    );
  }
}
