import { z } from "zod";
import { getTranslations } from "next-intl/server";

import { CountryCode, Status, Resource, Action, Subscription } from "@/generated/prisma";

import { EventService } from "@/features/event/event.service";
import { DomainEvent } from "@/features/event/domain-events";
import { ExtendedUser } from "@/features/user/user.service";
import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { createZodError, Data, secureUrlSchema, type Validated } from "@/core/validation/validation.utils";
import { Validate } from "@/core/decorators/validate.decorator";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { UserAccessor } from "@/core/base/user-accessor";
import { SubscriptionService } from "@/ee/subscription/subscription.service";

const Schema = z.object({
  email: z.email(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  country: z.enum(CountryCode),
  status: z.enum([Status.active, Status.inactive]),
  avatarUrl: secureUrlSchema().or(z.literal("")).nullable(),
  roleId: z.uuid(),
});
export type AdminUpdateUserDetailsData = Data<typeof Schema>;

export abstract class AdminUpdateUserDetailsRepo {
  abstract findOrThrow(email: string): Promise<ExtendedUser>;
  abstract adminUpdateDetails(args: { userId: string } & AdminUpdateUserDetailsData): Promise<void>; // TODO do we need the admin prefix?
}

export abstract class UpdateUserRoleRepo {
  abstract isSystemRole(id: string): Promise<boolean>;
  abstract hasAnotherActiveSystemRoleUser(excludeUserId: string): Promise<boolean>;
}

export abstract class AdminUpdateUserSubscriptionRepo {
  abstract getSubscriptionOrThrow(companyId: string): Promise<Subscription>;
  abstract countActiveUsers(): Promise<number>;
}

@TentantInteractor({ resource: Resource.users, action: Action.update })
export class AdminUpdateUserDetailsInteractor extends UserAccessor {
  constructor(
    private userRepo: AdminUpdateUserDetailsRepo,
    private roleRepo: UpdateUserRoleRepo,
    private eventService: EventService,
    private subscriptionService: SubscriptionService,
    private subscriptionRepo: AdminUpdateUserSubscriptionRepo,
  ) {
    super();
  }

  @Validate(Schema)
  @Transaction
  async invoke(data: AdminUpdateUserDetailsData): Validated<AdminUpdateUserDetailsData> {
    const targetUser = await this.userRepo.findOrThrow(data.email);
    const targetUserId = targetUser.id;

    if (targetUserId === this.user.id) throw new Error("Cannot update own details.");

    const targetIsSystem = targetUser.roleId ? await this.roleRepo.isSystemRole(targetUser.roleId) : false;
    const newRoleIsSystemAndActive = (await this.roleRepo.isSystemRole(data.roleId)) && data.status === Status.active;

    if (targetIsSystem && !newRoleIsSystemAndActive) {
      const hasAnother = await this.roleRepo.hasAnotherActiveSystemRoleUser(targetUserId);

      if (!hasAnother) {
        const t = await getTranslations("Common");
        const error = createZodError<AdminUpdateUserDetailsData>(t("errors.roleSystemRequired"), ["roleId"]);

        return {
          ok: false,
          error,
        };
      }
    }

    await this.userRepo.adminUpdateDetails({
      userId: targetUserId,
      ...data,
    });

    const statusChanged = targetUser.status !== data.status;

    if (statusChanged) await this.handleSubscriptionQuantityUpdate(targetUser.companyId);

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

    return { ok: true, data };
  }

  private async handleSubscriptionQuantityUpdate(companyId: string): Promise<void> {
    const subscription = await this.subscriptionRepo.getSubscriptionOrThrow(companyId);

    if (!subscription.lemonSqueezyId || !subscription.lemonSqueezyVariantId) return;

    const activeUsersCount = await this.subscriptionRepo.countActiveUsers();

    await this.subscriptionService.updateSubscriptionQuantityOrThrow(
      subscription.lemonSqueezyId,
      subscription.lemonSqueezyVariantId,
      activeUsersCount,
    );
  }
}
