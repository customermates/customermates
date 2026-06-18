import type { RepoArgs } from "@/core/utils/types";
import type { GetCompanyDetailsRepo } from "./get-company-details.interactor";
import type { UpdateCompanyDetailsRepo } from "./update-company-details.interactor";
import type { GetOrCreateInviteTokenRepo } from "./get-or-create-invite-token.interactor";
import type { InviteTokenRepo } from "@/features/company/invite-token-validation.interactor";
import type { SubscriptionRepo } from "@/ee/subscription/subscription.service";
import type { GetSubscriptionRepo } from "@/ee/subscription/get-subscription.interactor";
import type { RefreshSubscriptionRepo } from "@/ee/subscription/refresh-subscription.interactor";
import type { AdminUpdateUserSubscriptionRepo } from "@/features/user/upsert/admin-update-user-details.interactor";
import type { CreateCheckoutCompanyRepo } from "@/ee/subscription/create-checkout-session.interactor";

import { Status, SubscriptionStatus } from "@/generated/prisma";

import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { BaseRepository } from "@/core/base/base-repository";

export class PrismaCompanyRepo
  extends BaseRepository
  implements
    GetCompanyDetailsRepo,
    UpdateCompanyDetailsRepo,
    GetOrCreateInviteTokenRepo,
    InviteTokenRepo,
    SubscriptionRepo,
    GetSubscriptionRepo,
    RefreshSubscriptionRepo,
    AdminUpdateUserSubscriptionRepo,
    CreateCheckoutCompanyRepo
{
  @Transaction
  async updateDetails(args: RepoArgs<UpdateCompanyDetailsRepo, "updateDetails">) {
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

  async findUnexpiredTokenForCompany() {
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

  async findToken(token: string) {
    const res = await this.prisma.inviteToken.findUnique({
      where: { token },
      include: { company: { select: { name: true } } },
    });

    if (!res) return null;

    return {
      ...res,
      companyName: res.company.name ?? "",
    };
  }

  @Transaction
  @BypassTenantGuard
  async upsertSubscription(data: RepoArgs<SubscriptionRepo, "upsertSubscription">) {
    const payload = {
      companyId: data.companyId,
      lemonSqueezyId: data.lemonSqueezyId,
      lemonSqueezyVariantId: data.lemonSqueezyVariantId,
      status: data.status ?? SubscriptionStatus.trial,
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
  async getSubscriptionOrThrow(companyId: string) {
    const subscription = await this.prisma.subscription.findUniqueOrThrow({
      where: { companyId },
    });

    return subscription;
  }

  async countActiveUsers() {
    return await this.prisma.user.count({
      where: { companyId: this.companyId, status: Status.active },
    });
  }
}
