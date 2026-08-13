import type { EventService } from "@/features/event/event.service";
import type { TenantUser } from "@/features/user/user.schema";
import type { Data } from "@/core/validation/validation.utils";
import type { SubscriptionService } from "@/ee/subscription/subscription.service";
import type { CountActiveUsersRepo } from "@/features/user/count-active-users.repo";

import { z } from "zod";
import { getTranslations } from "next-intl/server";
import { CountryCode, Status, Resource, Action, SubscriptionPlan } from "@/generated/prisma";

import type { Subscription } from "@/generated/prisma";

import { DomainEvent } from "@/features/event/domain-events";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { createZodError, zx, type Validated } from "@/core/validation/validation.utils";
import { Write } from "@/core/decorators/write.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { getTenantUser } from "@/core/decorators/tenant-context";
import { checkIds } from "@/core/validation/validators/check-ids";
import { CustomErrorCode } from "@/core/validation/validation.types";

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

export abstract class AdminUpdateUserDetailsRepo {
  abstract findExistingEmailsCompanyWide(emails: Set<string>): Promise<Set<string>>;
  abstract findOrThrowCompanyWide(email: string): Promise<TenantUser>;
  abstract adminUpdateDetails(args: { userId: string } & AdminUpdateUserDetailsData): Promise<void>;
}

export abstract class UpdateUserRoleRepo {
  abstract isSystemRoleOrThrow(id: string): Promise<boolean>;
  abstract hasAnotherActiveSystemRoleUser(excludeUserId: string): Promise<boolean>;
}

export abstract class AdminUpdateUserSubscriptionRepo {
  abstract getSubscriptionOrThrow(): Promise<Subscription>;
  abstract assertNoCheckoutReservationInProgress(now: Date): Promise<void>;
}

@TenantInteractor({ resource: Resource.users, action: Action.update })
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

    if (targetUserId === getTenantUser().id) throw new Error("Cannot update own details.");

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

    const statusChanged = targetUser.status !== data.status;
    if (statusChanged) await this.subscriptionRepo.assertNoCheckoutReservationInProgress(new Date());

    await this.userRepo.adminUpdateDetails({
      userId: targetUserId,
      ...data,
    });

    if (statusChanged) await this.handleSubscriptionQuantityUpdate();

    await this.eventService.publish(DomainEvent.USER_UPDATED, {
      entityId: targetUserId,
      payload: {
        firstName: data.firstName,
        lastName: data.lastName,
        country: data.country,
        status: data.status,
        avatarUrl: data.avatarUrl,
        roleId: data.roleId,
      },
    });

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
