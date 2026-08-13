import type { RepoArgs } from "@/core/utils/types";
import type { EntityTerminologyOverride } from "@/features/entity-terminology/entity-terminology.types";
import type { GetCompanySettingsRepo } from "./get-company-settings.interactor";
import type { UpdateCompanySettingsRepo } from "./update-company-settings.interactor";
import type { GetOrCreateInviteTokenRepo } from "./get-or-create-invite-token.interactor";
import type { InviteTokenRepo } from "@/features/company/invite-token-validation.interactor";
import type { SubscriptionRepo } from "@/ee/subscription/subscription.service";
import type { GetSubscriptionRepo } from "@/ee/subscription/get-subscription.interactor";
import type { RefreshSubscriptionRepo } from "@/ee/subscription/refresh-subscription.interactor";
import type { CreateCheckoutCompanyRepo } from "@/ee/subscription/create-checkout-session.interactor";
import type { RouteGuardSubscriptionRepo } from "@/features/auth/route-guard.service";
import type { AdminUpdateUserSubscriptionRepo } from "@/features/user/upsert/admin-update-user-details.interactor";
import type { EntitlementSubscriptionRepo } from "@/ee/subscription/entitlement.service";
import type { CreateAuthLinkSubscriptionRepo } from "@/ee/messaging/connect/create-auth-link.interactor";

import { SubscriptionStatus } from "@/generated/prisma";

import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { BaseRepository } from "@/core/base/base-repository";
import { createCheckoutReservation, parseCheckoutReservationMarker } from "@/ee/subscription/checkout-reservation";

export class PrismaCompanyRepo
  extends BaseRepository
  implements
    GetCompanySettingsRepo,
    UpdateCompanySettingsRepo,
    GetOrCreateInviteTokenRepo,
    InviteTokenRepo,
    SubscriptionRepo,
    GetSubscriptionRepo,
    RefreshSubscriptionRepo,
    CreateCheckoutCompanyRepo,
    AdminUpdateUserSubscriptionRepo,
    RouteGuardSubscriptionRepo,
    EntitlementSubscriptionRepo,
    CreateAuthLinkSubscriptionRepo
{
  @Transaction
  async updateDetails(args: RepoArgs<UpdateCompanySettingsRepo, "updateDetails">) {
    const { companyId } = this.user;

    await this.prisma.company.update({
      data: { ...args, id: companyId },
      where: { id: companyId },
    });
  }

  async getDetails() {
    const { companyId } = this.user;
    return await this.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
  }

  async getTerminology(): Promise<EntityTerminologyOverride[]> {
    const { companyId } = this.user;

    return this.prisma.entityTerminology.findMany({
      where: { companyId },
      select: { entityType: true, presetKey: true },
      orderBy: { entityType: "asc" },
    });
  }

  @Transaction
  async upsertTerminology(entries: RepoArgs<UpdateCompanySettingsRepo, "upsertTerminology">) {
    const { companyId } = this.user;

    for (const entry of entries) {
      const row = { companyId, entityType: entry.entityType, presetKey: entry.presetKey };

      await this.prisma.entityTerminology.upsert({
        where: { companyId_entityType: { companyId, entityType: entry.entityType } },
        create: row,
        update: row,
      });
    }
  }

  @Transaction
  async createInviteToken(data: RepoArgs<GetOrCreateInviteTokenRepo, "createInviteToken">) {
    const { id, companyId } = this.user;

    return await this.prisma.inviteToken.create({
      data: {
        token: data.token,
        companyId,
        createdById: id,
        expiresAt: data.expiresAt,
      },
    });
  }

  async findUnexpiredToken() {
    const { companyId } = this.user;

    return await this.prisma.inviteToken.findFirst({
      where: {
        companyId,
        expiresAt: { gt: new Date() },
      },
      orderBy: {
        expiresAt: "desc",
      },
    });
  }

  @BypassTenantGuard
  async findTokenUnscoped(token: string) {
    return this.prisma.inviteToken.findUnique({ where: { token } });
  }

  @Transaction
  @BypassTenantGuard
  async upsertSubscriptionUnscoped(data: RepoArgs<SubscriptionRepo, "upsertSubscriptionUnscoped">) {
    const payload = {
      companyId: data.companyId,
      lemonSqueezyId: data.lemonSqueezyId,
      lemonSqueezyVariantId: data.lemonSqueezyVariantId,
      status: data.status ?? SubscriptionStatus.trial,
      plan: data.plan,
      quantity: data.quantity,
      trialEndDate: data.trialEndDate,
      currentPeriodEnd: data.currentPeriodEnd,
    };

    await this.prisma.subscription.upsert({
      where: { companyId: data.companyId },
      create: payload,
      update: payload,
    });
  }

  @BypassTenantGuard
  async findCompanyIdBySubscriptionIdOrThrowUnscoped(subscriptionId: string) {
    const subscription = await this.prisma.subscription.findFirstOrThrow({
      where: { lemonSqueezyId: subscriptionId },
      select: { companyId: true },
    });

    return subscription.companyId;
  }

  @BypassTenantGuard
  async countActiveUsersUnscoped(companyId: string) {
    return this.prisma.user.count({ where: { companyId, status: "active" } });
  }

  @BypassTenantGuard
  async withSubscriptionLockUnscoped<T>(companyId: string, work: () => Promise<T>): Promise<T> {
    return this.withCompanyTransaction(companyId, work);
  }

  async getSubscriptionOrThrow() {
    return this.prisma.subscription.findUniqueOrThrow({
      where: { companyId: this.companyId },
    });
  }

  @Transaction
  async claimCheckoutReservationOrThrow(
    options: RepoArgs<CreateCheckoutCompanyRepo, "claimCheckoutReservationOrThrow">,
  ) {
    const subscription = await this.getSubscriptionOrThrow();
    if (subscription.plan === "enterprise")
      throw new Error("Enterprise workspaces are billed manually and cannot start a self-serve checkout");
    if (subscription.lemonSqueezyId)
      throw new Error("This workspace already has a Lemon Squeezy subscription; use the customer portal instead");

    const existingReservation = parseCheckoutReservationMarker(subscription.lemonSqueezyVariantId);
    if (existingReservation && new Date(existingReservation.payload.bindingExpiresAt) > options.now)
      throw new Error("A checkout is already in progress for this workspace");
    if (subscription.lemonSqueezyVariantId && !existingReservation)
      throw new Error("The workspace has an unexpected billing binding and cannot start checkout");

    const quantity = await this.prisma.user.count({
      where: { companyId: this.companyId, status: "active" },
    });
    const reservation = createCheckoutReservation({
      secret: options.secret,
      companyId: this.companyId,
      offer: options.offer,
      quantity,
      checkoutExpiresAt: options.checkoutExpiresAt,
      bindingExpiresAt: options.bindingExpiresAt,
    });

    await this.prisma.subscription.update({
      where: { companyId: this.companyId },
      data: { lemonSqueezyVariantId: reservation.marker },
    });

    return { reservation, quantity };
  }

  @Transaction
  async releaseCheckoutReservationIfMatches(marker: string) {
    const result = await this.prisma.subscription.updateMany({
      where: {
        companyId: this.companyId,
        lemonSqueezyId: null,
        lemonSqueezyVariantId: marker,
      },
      data: { lemonSqueezyVariantId: null },
    });

    return result.count > 0;
  }

  async hasCheckoutReservationInProgress(now: Date) {
    const subscription = await this.getSubscriptionOrThrow();
    const reservation = parseCheckoutReservationMarker(subscription.lemonSqueezyVariantId);
    return Boolean(reservation && new Date(reservation.payload.bindingExpiresAt) > now);
  }

  @BypassTenantGuard
  async getSubscriptionOrThrowUnscoped(companyId: string) {
    const subscription = await this.prisma.subscription.findUniqueOrThrow({
      where: { companyId },
    });

    return subscription;
  }
}
