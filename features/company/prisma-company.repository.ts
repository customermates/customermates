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

import { ConversionEventType, SubscriptionStatus } from "@/generated/prisma";

import { getCustomColumnRepo, getDealRepo } from "@/core/di";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { BaseRepository } from "@/core/base/base-repository";

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

    if (args.dealWeightingColumnId !== undefined) await getDealRepo().recalculateWeightedValuesForCompany();
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
  async setDealStageWeights(entries: RepoArgs<UpdateCompanySettingsRepo, "setDealStageWeights">) {
    const { companyId } = this.user;

    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { dealWeightingColumnId: true },
    });

    if (!company?.dealWeightingColumnId) return;

    await getCustomColumnRepo().setOptionWeights(company.dealWeightingColumnId, entries);
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

  @BypassTenantGuard
  async withSubscriptionCompanyLockUnscoped<T>(companyId: string, fn: () => Promise<T>) {
    return this.withCompanyTransaction(companyId, fn);
  }

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
      agentCreditAnchorAt: data.agentCreditAnchorAt,
    };

    await this.withCompanyTransaction(data.companyId, async () => {
      await this.prisma.subscription.upsert({
        where: { companyId: data.companyId },
        create: payload,
        update: payload,
      });

      if (payload.status !== SubscriptionStatus.active) return;

      const attributed = await this.prisma.adAttribution.count({ where: { companyId: data.companyId } });
      if (attributed === 0) return;

      await this.prisma.conversionEvent.createMany({
        data: [{ companyId: data.companyId, type: ConversionEventType.paid, occurredAt: new Date() }],
        skipDuplicates: true,
      });
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

  async getSubscriptionOrThrow() {
    return this.prisma.subscription.findUniqueOrThrow({
      where: { companyId: this.companyId },
    });
  }

  @BypassTenantGuard
  async getSubscriptionOrThrowUnscoped(companyId: string) {
    const subscription = await this.prisma.subscription.findUniqueOrThrow({
      where: { companyId },
    });

    return subscription;
  }
}
